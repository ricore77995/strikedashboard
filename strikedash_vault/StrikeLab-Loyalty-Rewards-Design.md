---
title: StrikeLab Loyalty Rewards Design
type: design
status: draft
created: 2026-06-03
related:
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[Yogo-API]]"
  - "[[Yogo-StrikeLab-Gap-Report]]"
---

# StrikeLab Loyalty Rewards — Design Spec

> Time-based loyalty reward system. Admin defines arbitrary loyalty levels with conditions and rewards. Separate from XP gamification tiers. Yogo discount code API (Spike 3) validated and available.

## 1. Goal

Admin can create loyalty levels (e.g. "6 meses de fidelidade → 1 mês grátis"), the system detects qualifying students, and admin approves rewards that are applied to the student's Yogo membership as discount codes.

## 2. Condition types

| Type | Logic | Example |
|------|-------|---------|
| `active_months` | Consecutive months with `classify() === "active"` based on `yogo_membership_snapshot` data | `threshold: 6` = 6 consecutive active months |
| `xp_tier` | Student has reached a specific XP tier in gamification | `threshold: "diamante"` = reached Diamante (80,000 XP) |

Conditions are evaluated **independently**. A loyalty level has exactly one condition.

### `active_months` evaluation

- Source: `yogo_membership_snapshot` (daily diff from Tier 2 cron) + `gamification_state.currentStreakDays`
- Algorithm: count consecutive days where `classify(membership, date) === "active"` starting from today going backwards, divide by 30.44 (average month length), floor to integer
- Edge case: student who pauses for 1 month in the middle resets the counter
- Simpler alternative: use `membership.start_date` (from Yogo) as anchor. If `classify()` is currently active AND `today - start_date >= threshold_months * 30`, student qualifies. Pauses break this.
- **Decision: use `start_date` anchor with pause subtraction.** Count = `(today - start_date) / 30.44` minus any pause days. This is deterministic from existing data.

### `xp_tier` evaluation

- Source: `gamification_state.lifetimeXP` + `tierThresholds` from `constants.ts`
- Algorithm: `getTier(state.lifetimeXP).tier === level.condition.threshold`
- Already computed and materialized — no new queries needed

## 3. Reward types

| Type | Yogo API mapping | Example |
|------|-----------------|---------|
| `free_month` | `POST /discount-codes` with `discount_percent: 100`, `membership_discount_number_of_payments: 1` | Diamante free month |
| `fixed_amount` | `POST /discount-codes` with `type: "discount_amount"`, `discount_amount: N` | €15 off next payment |

Both reward types create a **single-use, single-customer discount code** and attach it to the student's membership via `PUT /memberships/{id}`.

### Discount code creation params

```typescript
// Free month
{
  name: `LOYALTY_${levelId}_${customerId}`,
  type: "discount_percent",
  discount_percent: 100,
  discount_amount: 0,
  valid_for_items: ["membership_types"],
  has_use_per_customer_limit: true,
  use_per_customer_limit: 1,
  has_customer_limit: true,
  customer_limit: 1,
  active: true,
  membership_discount_on_limited_number_of_payments: true,
  membership_discount_number_of_payments: 1,
  valid_for_membership_registration_fee: false
}

// Fixed amount
{
  name: `LOYALTY_${levelId}_${customerId}`,
  type: "discount_amount",
  discount_percent: 0,
  discount_amount: reward.amount, // e.g. 15
  valid_for_items: ["membership_types"],
  has_use_per_customer_limit: true,
  use_per_customer_limit: 1,
  has_customer_limit: true,
  customer_limit: 1,
  active: true,
  membership_discount_on_limited_number_of_payments: true,
  membership_discount_number_of_payments: 1,
  valid_for_membership_registration_fee: false
}
```

## 4. Data model

### `loyalty_level` (admin-defined levels)

```prisma
model LoyaltyLevel {
  id          Int      @id @default(autoincrement())
  name        String   // "Fidelidade 6 Meses"
  description String?  // Optional admin notes
  active      Boolean  @default(true)

  // Condition
  conditionType  String   // "active_months" | "xp_tier"
  conditionValue  String   // "6" (months) | "diamante" (tier name)

  // Reward
  rewardType     String   // "free_month" | "fixed_amount"
  rewardValue    Int      // 0 for free_month (100% implied), cents for fixed_amount (e.g. 1500 = €15.00)

  // Frequency
  frequency      String   @default("once") // "once" = one-time per student, "yearly" = once per calendar year

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  grants LoyaltyGrant[]
}
```

### `loyalty_grant` (per-student instances)

```prisma
model LoyaltyGrant {
  id              Int      @id @default(autoincrement())
  loyaltyLevelId  Int
  yogoCustomerId  Int      // Yogo customer ID
  status          String   @default("pending_approval") // "pending_approval" | "approved" | "applied" | "expired" | "rejected"

  // Approval
  approvedBy      String?  // "admin" (session user)
  approvedAt      DateTime?

  // Yogo integration
  yogoDiscountCodeId   Int?     // ID returned from POST /discount-codes
  yogoDiscountCodeName String?  // "LOYALTY_1_1156216"
  appliedAt            DateTime?

  // Context at time of qualification
  qualifyingValue  String?  // e.g. "6.2 months active" or "diamante tier reached 2026-05-28"

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  loyaltyLevel LoyaltyLevel @relation(fields: [loyaltyLevelId], references: [id])

  @@unique([loyaltyLevelId, yogoCustomerId, status]) // prevent duplicate pending grants
}
```

## 5. Flow

### 5.1 Detection (cron — daily)

```
1. Load all active LoyaltyLevels
2. For each level:
   a. Query students matching condition
   b. Exclude students with existing grant for this level (check frequency)
   c. Create LoyaltyGrant with status "pending_approval"
3. Expire any grants older than 30 days still in "pending_approval"
```

### 5.2 Admin approval (dashboard UI)

```
1. Admin sees pending grants queue: student name, level, condition met, reward
2. Admin clicks "Approve" on a grant
3. System:
   a. POST /discount-codes → create Yogo discount code
   b. PUT /memberships/{id} → attach code to student's membership
   c. Update grant: status="applied", yogoDiscountCodeId, appliedAt
4. If API fails → mark as "failed" with error message, admin can retry
```

### 5.3 Rejection

```
1. Admin clicks "Reject" with optional reason
2. Grant moves to "rejected"
3. No Yogo API calls
4. Student can re-qualify if they still meet the condition next cycle
```

## 6. UI pages

### 6.1 Admin: Loyalty Levels CRUD

**Route:** `/dashboard/strikelab/loyalty`

- List of all loyalty levels (name, condition, reward, frequency, active/inactive)
- Add/Edit level form:
  - Name (text)
  - Condition type (dropdown: active_months / xp_tier)
  - Condition value (number for months, dropdown for tier)
  - Reward type (dropdown: free_month / fixed_amount)
  - Reward value (number for fixed amount, hidden for free_month)
  - Frequency (dropdown: once / yearly)
  - Active toggle

### 6.2 Admin: Approval Queue

**Route:** `/dashboard/strikelab/loyalty/pending`

- Table of pending grants: student name, plan, level, condition met, reward
- Actions: Approve (green), Reject (red)
- Show applied grants (history) below
- Status filters: pending / applied / rejected / expired

## 7. Cron jobs

### `loyalty-detect` — Daily at 03:00 Lisbon

- Runs after membership sweep (02:00) so `yogo_membership_snapshot` is fresh
- Detects qualifying students and creates pending grants
- Idempotent: skips students with existing grants for the same level (unless frequency=yearly and last grant was in a previous year)

### `loyalty-expire` — Daily at 04:00 Lisbon

- Marks grants in `pending_approval` for >30 days as `expired`
- Keeps the approval queue clean

## 8. Edge cases

| Case | Behavior |
|------|----------|
| Student cancels between detection and approval | Admin sees warning. Approval still works — discount applies to current paid period |
| Student has no active membership at approval time | System blocks approval. Grant stays pending until membership reactivated or grant expires |
| Yogo API fails during code creation | Grant marked "failed". Admin sees error. Retry button available |
| Admin deactivates a level | Existing pending grants remain. No new grants created |
| Student qualifies for multiple levels simultaneously | Separate grants created for each. Admin approves independently |
| Frequency=yearly, student already got reward this year | Skipped until next calendar year |

## 9. Security & cost controls

- **Admin-only** — both level CRUD and approval queue require admin role
- **No automatic Yogo writes** — every financial action requires admin click
- **Audit trail** — every grant has `approvedBy`, `approvedAt`, `appliedAt`
- **Discount code naming** — `LOYALTY_{levelId}_{customerId}` prefix for easy identification in Yogo admin
- **Cost visibility** — dashboard shows total value of applied rewards per month (sum of discount amounts)
- **Cleanup** — expired codes in Yogo should be cleaned up (future: auto-archive applied codes after 90 days)

## 10. Files likely to change

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `LoyaltyLevel` and `LoyaltyGrant` models |
| `src/lib/gamification/loyalty.ts` | Detection logic, condition evaluation |
| `src/lib/yogo/discount-codes.ts` | Yogo discount code API client (create + apply) |
| `src/app/api/strikelab/loyalty/levels/route.ts` | CRUD API for levels |
| `src/app/api/strikelab/loyalty/grants/route.ts` | List/approve/reject grants |
| `src/app/api/strikelab/loyalty/grants/[id]/approve/route.ts` | Approve action |
| `src/app/api/strikelab/loyalty/grants/[id]/reject/route.ts` | Reject action |
| `src/app/dashboard/strikelab/loyalty/page.tsx` | Levels CRUD page |
| `src/app/dashboard/strikelab/loyalty/pending/page.tsx` | Approval queue page |
| `src/app/dashboard/strikelab/layout.tsx` | Add "Fidelidade" sub-nav entry |

## 11. Implementation slices

| Slice | Content | LOC est. |
|-------|---------|----------|
| **D1** Prisma schema + migration | Add models, run migrate | ~30 |
| **D2** Yogo discount code client | `createDiscountCode()`, `applyToMembership()` | ~80 |
| **D3** Loyalty detection service | Condition evaluation, grant creation | ~120 |
| **D4** Levels CRUD API + page | Create/edit/deactivate levels | ~200 |
| **D5** Approval queue API + page | List/approve/reject grants | ~250 |
| **D6** Cron jobs | `loyalty-detect` + `loyalty-expire` | ~60 |
| **D7** Sub-nav + integration | Add "Fidelidade" tab, wire into StrikeLab layout | ~20 |

**Total: ~760 LOC across 7 slices**

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Yogo discount code API changes (undocumented) | Medium | High — free months stop working | Discount code CRUD verified with real traffic. Naming convention `LOYALTY_*` makes codes identifiable. Fallback: manual Yogo admin. |
| `active_months` calculation wrong (pause edge cases) | Medium | Medium — wrong students qualify | Use membership `start_date` minus pause days. Unit test with pause scenarios. |
| Student gets free month, cancels immediately | Low | Medium — lost revenue with no retention | Admin approval gate. Cost visibility dashboard. Could add "minimum remaining subscription" check. |
| Discount code not picked up by auto-renewal | Low | High — student charged anyway | Verify via `GET /memberships/{id}?populate[]=discount_code` after applying. Monitor first few applications manually. |
