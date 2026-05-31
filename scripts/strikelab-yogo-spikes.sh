#!/usr/bin/env bash
#
# StrikeLab — Yogo API spike capture
# Runs the 3 read-only spikes (check-in timestamp, renewal detection, user DOB)
# Spike 3 (discount-code creation) must be done manually in DevTools.
#
# Usage:
#   ./scripts/strikelab-yogo-spikes.sh                 # default: yesterday's classes
#   ./scripts/strikelab-yogo-spikes.sh 2026-05-25      # specific date with attendance
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SPIKES_DIR="$REPO_ROOT/strikedash_vault/yogo-spikes"
mkdir -p "$SPIKES_DIR"

# Load env
ENV_FILE="$REPO_ROOT/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ missing .env.local — needs YOGO_TOKEN, YOGO_BASE, YOGO_ORIGIN" >&2
  exit 1
fi
set -a; . "$ENV_FILE"; set +a

: "${YOGO_TOKEN:?YOGO_TOKEN required in .env.local}"
: "${YOGO_BASE:=https://api.yogo.dk}"
: "${YOGO_ORIGIN:=https://strikershouse.yogobooking.pt}"

H=(-H "Authorization: Bearer $YOGO_TOKEN"
   -H "x-yogo-request-context: admin"
   -H "Origin: $YOGO_ORIGIN"
   -H "Referer: $YOGO_ORIGIN/"
   -H "Content-Type: application/json"
   -H "Accept: application/json, text/plain, */*")

# Date handling: macOS vs GNU
if date -v-1d +%Y-%m-%d >/dev/null 2>&1; then
  YESTERDAY=$(date -v-1d +%Y-%m-%d)
else
  YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
fi
DATE_FROM=${1:-$YESTERDAY}
DATE_TO=$(date +%Y-%m-%d)

echo "═══════════════════════════════════════════════════════"
echo "  StrikeLab — Yogo API Spikes"
echo "  Tenant: $YOGO_ORIGIN"
echo "  Date range: $DATE_FROM → $DATE_TO"
echo "  Output: $SPIKES_DIR"
echo "═══════════════════════════════════════════════════════"

# ───────────────────────────────────────────────────────────
# SPIKE 1: Classes with signups (validate signup.checked_in is Unix ms)
# ───────────────────────────────────────────────────────────
echo ""
echo "[1/3] Spike 1 — Check-in timestamps"
echo "      GET /classes?startDate=$DATE_FROM&endDate=$DATE_TO&populate[]=signups.user"

curl -sf "${H[@]}" \
  "$YOGO_BASE/classes?startDate=$DATE_FROM&endDate=$DATE_TO&populate[]=signups&populate[]=signups.user&populate[]=class_type&populate[]=teachers&populate[]=signup_count&populate[]=checked_in_count&sort[]=date%20ASC&sort[]=start_time%20ASC" \
  > "$SPIKES_DIR/spike-1-classes-raw.json"

# Pretty-print + extract just the check-in field shapes for human inspection
jq '{
  responseType,
  classes_count: (.classes // [] | length),
  sample_signups_with_checkin: [
    (.classes // [])[] | .signups[]? | select(.checked_in != null and .checked_in > 0) |
    {
      class_id: .class_id,
      user_id: (.user_id // .user.id),
      signup_id: .id,
      checked_in_raw: .checked_in,
      checked_in_iso: (.checked_in | if . > 0 then (./1000 | strftime("%Y-%m-%dT%H:%M:%SZ")) else null end),
      cancelled_at: .cancelled_at,
      late_cancel: .late_cancel,
      createdAt: .createdAt,
      updatedAt: .updatedAt
    }
  ] | .[0:10]
}' "$SPIKES_DIR/spike-1-classes-raw.json" > "$SPIKES_DIR/spike-1-checkin-summary.json"

CHECKED_IN_COUNT=$(jq '.sample_signups_with_checkin | length' "$SPIKES_DIR/spike-1-checkin-summary.json")
echo "      ✓ Saved $SPIKES_DIR/spike-1-classes-raw.json"
echo "      ✓ Saved $SPIKES_DIR/spike-1-checkin-summary.json ($CHECKED_IN_COUNT checked-in samples)"

# Pick first user_id with check_in > 0 for spike 4
SAMPLE_USER_ID=$(jq -r '.sample_signups_with_checkin[0].user_id // empty' "$SPIKES_DIR/spike-1-checkin-summary.json")
echo "      First checked-in user_id: ${SAMPLE_USER_ID:-(none)}"

# ───────────────────────────────────────────────────────────
# SPIKE 2: Memberships list (validate renewal detection fields)
# ───────────────────────────────────────────────────────────
echo ""
echo "[2/3] Spike 2 — Renewal detection fields"
echo "      POST /reports/memberships-list {}"

curl -sf -X POST "${H[@]}" \
  -d '{}' \
  "$YOGO_BASE/reports/memberships-list" \
  > "$SPIKES_DIR/spike-2-memberships-raw.json"

# Summary: what renewal-related fields exist on a typical row
jq '{
  total_rows: (if type == "array" then length else (.data // .rows // [] | length) end),
  sample_row_fields: (
    if type == "array" then (.[0] // {})
    elif .data then (.data[0] // {})
    elif .rows then (.rows[0] // {})
    else {} end
  ) | keys,
  sample_active_with_next_payment: (
    [
      (if type == "array" then .[] else (.data // .rows // [])[] end) |
      select((.status == "active") and (.next_payment != null) and (.next_payment.date != null)) |
      {
        user_id, membership_type_name, status, status_text,
        start_date, paid_until, current_payment_period_start,
        next_payment, renewal_failed, renewal_failed_last_time_at,
        cancelled_from_date, payment_day_of_month
      }
    ] | .[0:3]
  ),
  sample_dunning: (
    [
      (if type == "array" then .[] else (.data // .rows // [])[] end) |
      select(.renewal_failed != null and .renewal_failed > 0) |
      {user_id, status, status_text, renewal_failed, renewal_failed_last_time_at, paid_until, next_payment}
    ] | .[0:3]
  )
}' "$SPIKES_DIR/spike-2-memberships-raw.json" > "$SPIKES_DIR/spike-2-renewal-summary.json"

SAMPLE_FIELDS=$(jq -r '.sample_row_fields | length' "$SPIKES_DIR/spike-2-renewal-summary.json")
echo "      ✓ Saved $SPIKES_DIR/spike-2-memberships-raw.json"
echo "      ✓ Saved $SPIKES_DIR/spike-2-renewal-summary.json ($SAMPLE_FIELDS fields per row)"

# ───────────────────────────────────────────────────────────
# SPIKE 4: User detail with DOB
# ───────────────────────────────────────────────────────────
echo ""
echo "[3/3] Spike 4 — User detail (DOB + populated memberships)"

if [[ -z "$SAMPLE_USER_ID" ]]; then
  echo "      ⚠ No checked-in user found in $DATE_FROM → $DATE_TO. Trying first user in memberships..."
  SAMPLE_USER_ID=$(jq -r '
    (if type == "array" then .[0] else (.data // .rows // [])[0] end).user_id // empty
  ' "$SPIKES_DIR/spike-2-memberships-raw.json")
fi

if [[ -z "$SAMPLE_USER_ID" ]]; then
  echo "      ✗ Could not find any user_id to test against. Skipping spike 4."
else
  echo "      GET /users?id=$SAMPLE_USER_ID&populate[]=memberships..."
  curl -sf "${H[@]}" \
    "$YOGO_BASE/users?id=$SAMPLE_USER_ID&populate[]=memberships&populate[]=memberships.membership_type&populate[]=memberships.next_payment&populate[]=memberships.status_text&populate[]=class_passes&populate[]=image" \
    > "$SPIKES_DIR/spike-4-user-detail-raw.json"

  jq '{
    sample_user: (
      (if type == "array" then .[0] else . end) |
      {
        id, first_name, last_name,
        date_of_birth, date_of_birth_present: (.date_of_birth != null),
        phone_present: (.phone != null and .phone != ""),
        email_present: (.email != null and .email != ""),
        vat_id_present: (.vat_id != null and .vat_id != ""),
        all_top_level_fields: (. | keys),
        memberships_count: (.memberships | length // 0),
        first_membership_fields: (.memberships[0] // {} | keys)
      }
    )
  }' "$SPIKES_DIR/spike-4-user-detail-raw.json" > "$SPIKES_DIR/spike-4-dob-summary.json"

  DOB_PRESENT=$(jq -r '.sample_user.date_of_birth_present' "$SPIKES_DIR/spike-4-dob-summary.json")
  echo "      ✓ Saved $SPIKES_DIR/spike-4-user-detail-raw.json"
  echo "      ✓ Saved $SPIKES_DIR/spike-4-dob-summary.json (date_of_birth present: $DOB_PRESENT)"
fi

# ───────────────────────────────────────────────────────────
# Final report
# ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✓ Spikes 1, 2, 4 captured"
echo ""
echo "  Files (all gitignored):"
ls -la "$SPIKES_DIR/"*.json 2>/dev/null | awk '{print "    " $NF, "(" $5 " bytes)"}'
echo ""
echo "  ⚠ Spike 3 (coupon creation POST) still pending."
echo "    See: strikedash_vault/yogo-spikes/SPIKE-3-MANUAL.md"
echo "═══════════════════════════════════════════════════════"
