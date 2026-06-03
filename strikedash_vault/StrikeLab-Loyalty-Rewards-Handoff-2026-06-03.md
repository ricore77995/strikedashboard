---
title: StrikeLab Loyalty Rewards Handoff
type: handoff
status: complete
created: 2026-06-03
related:
  - "[[StrikeLab-Loyalty-Rewards-Design]]"
  - "[[StrikeLab-v3.2-final]]"
  - "[[Yogo-API]]"
---

# StrikeLab Loyalty Rewards Handoff

## What shipped

All 7 slices shipped in this session:

| Commit | Slice | Content |
|--------|-------|---------|
| `9ab26a4` | D1 | Prisma models: `LoyaltyLevel` + `LoyaltyGrant` |
| `854b05a` | D2+D3 | Yogo discount code client + loyalty detection service |
| `28b7a4a` | D4+D5 API | Levels CRUD API + approval queue API (approve/reject) |
| `7995cb5` | D6+D7 + UI | Cron route + "Fidelidade" sub-nav + levels page + approval queue page |

**Status:** ✅ 510/510 tests green, tsc clean across all commits

## Spike 3 resolved

Yogo discount code API fully documented and added to `yogo-booking-api` skill:
- `POST /discount-codes` — create codes (100% free month, % discount, fixed amount)
- `PUT /memberships/{id}` — apply code to membership
- `GET /discount-codes?validFor=...` — filter by plan
- `DELETE /discount-codes/{id}` — delete code

Free month = `discount_percent: 100` + `membership_discount_number_of_payments: 1`

## Architecture

```
Detection flow:
  Cron (03:00 daily)
    → detectLoyaltyQualifications()
    → evaluateCondition() per student per level
    → LoyaltyGrant created with status "pending_approval"

Approval flow:
  Admin clicks "Aprovar" in /dashboard/strikelab/loyalty/pending
    → POST /api/strikelab/admin/loyalty/grants/[id]/approve
    → Fetch active membership from Yogo
    → createDiscountCode() via Yogo API
    → applyDiscountToMembership() via Yogo API
    → Grant updated to status "applied"
```

## Files created

| File | Purpose |
|------|---------|
| `prisma/schema.prisma` | `LoyaltyLevel` + `LoyaltyGrant` models |
| `src/lib/yogo/discount-codes.ts` | Yogo discount code client (create/apply/delete) |
| `src/lib/gamification/loyalty.ts` | Detection service + condition evaluation |
| `src/app/api/strikelab/admin/loyalty/levels/route.ts` | GET/POST levels |
| `src/app/api/strikelab/admin/loyalty/grants/route.ts` | GET grants |
| `src/app/api/strikelab/admin/loyalty/grants/[id]/approve/route.ts` | POST approve |
| `src/app/api/strikelab/admin/loyalty/grants/[id]/reject/route.ts` | POST reject |
| `src/app/api/cron/strikelab-loyalty-detect/route.ts` | Cron route |
| `src/app/dashboard/strikelab/loyalty/page.tsx` | Levels CRUD page |
| `src/app/dashboard/strikelab/loyalty/pending/page.tsx` | Approval queue page |
| `src/app/dashboard/strikelab/layout.tsx` | "Fidelidade" sub-nav tab |

## How to use

1. Go to **StrikeLab → Fidelidade** tab
2. Click **"+ Novo Nível"** to create a loyalty level:
   - Name: "Fidelidade 6 Meses"
   - Condition: Meses activos = 6
   - Reward: 1 mês grátis
   - Frequency: Uma vez (lifetime)
3. Cron runs daily at 03:00, detects qualifying students, creates pending grants
4. Go to **"→ Ver fila de aprovação"** to see pending grants
5. Click **"Aprovar"** to create Yogo discount code and apply to student's membership
6. Student's next auto-renewal is free (100% discount for 1 payment)

## Remaining work

- **Vercel cron config:** Add `0 3 * * *` for `/api/cron/strikelab-loyalty-detect` in `vercel.json`
- **Production testing:** First few approvals should be verified manually in Yogo admin
- **Cost dashboard:** Sum of applied rewards per month (mentioned in design, not yet built)
- **Level edit/deactivate:** UI only has create — need edit toggle for active/inactive
- **Condition: `xp_tier`** relies on gamification state being populated (Phase 1+ running)

## Open backlog

- Cross-training rewards (Phase 3 original scope)
- Dashboard roadmap: WA↔Yogo audit → Leads Kanban → Yogo token refresh → WA Cloud API
- Desktop nav active-state fix already shipped in this session
