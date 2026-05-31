---
title: StrikeLab v3.2-final — Spec Consolidada
type: design
version: 3.2-final
status: spec aprovada — pronta para Phase 0
created: 2026-05-28
supersedes: StrikeLab-v3-full.json (v3.0), StrikeLab-v3.1-Refined (v3.1)
owner: Ricardo
---

# StrikeLab v3.2-final

> Spec consolidada após 2 rondas de adversarial refinement + validação contra Yogo API real. Aprovada por Ricardo em 2026-05-28.

Ver também: [[The Vault]] · [[Yogo-StrikeLab-Gap-Report]] · [[StrikeLab-Phase-0-Plan-Final]] · [[StrikeLab-Convergence-Report]]

## Decisões aprovadas

| # | Decisão | Status |
|---|---|---|
| D1 | Apagar penalty `inactivity_long -50pts` (health-discrim risk) | ✅ aprovado |
| D2 | Apagar penalty `broken_streak -30pts` | ✅ aprovado |
| D3 | Apagar boost `embaixador_ratio` (stories>checkins) | ✅ aprovado |
| D4 | Apagar boost `atleta` (Livre x1.4) | ✅ aprovado |
| D5 | Apagar `mini_random` opaco | ✅ aprovado |
| D6 | Apagar `multi_class_same_day "variable"` | ✅ aprovado |
| D7 | Apagar `decisionVote: true` Diamante | ✅ aprovado |
| D8 | pointsPerClass P8: 60 → 110 | ✅ aprovado |
| D9 | pointsPerClass P12: 45 → 80 | ✅ aprovado |
| D10 | pointsPerClass Livre: 35 → 55 | ✅ aprovado |
| D17 | Diamond prize: "1 mês grátis" → 25% desconto próximo mês | ✅ aprovado |
| D27 | Liga dos Campeões: parallel leaderboard (não exílio) | ✅ aprovado |
| D36 | Auto-tuning de thresholds de prémios (>6% MRR → +10%) | ✅ aprovado |
| D37 | Boost scope rule: boosts SÓ em checkins, não em one-shots | ✅ aprovado |
| **D38** | **Trigger `early_renewal`** | ❌ **REMOVIDO** — subscrições são auto-renew, não existe "antecipada" |
| D39 | Trigger `comeback` (+250 após ≥21 dias ausência) | ✅ aprovado |

Patches técnicos aplicados (sem aprovação separada — todos correctness/legal):
- P1-P13 (síntese inline Round 2)
- B1-B4 (canónicos do skill yogo-booking-api)
- P14-P17 (resultantes dos spikes reais)

## 1. Princípios de design

1. **Opt-in granular**, opt-out friction-free.
2. **Premia treino primeiro, social depois.** Reel jamais vale mais que uma semana de treino disciplinado.
3. **Sem public shaming, sem penalty health-discriminatory.** Inactividade nunca custa pontos.
4. **Operacionalmente leve.** Todo trigger é 100% automático OU tem UI admin definido.
5. **RGPD by design.** DPIA, lawful basis, retenção, erasure.
6. **Nenhuma mecânica entra na spec sem exemplo numérico funcional.**

## 2. Arquitectura

### 2.1 Storage (Turso/libSQL)

- `gamification_event_log` — append-only com `idempotency_key @unique` + `points_period "YYYY-MM"` (computed in app code via `Intl.DateTimeFormat`, **NÃO** via SQL generated columns — libSQL não suporta `AT TIME ZONE`)
- `gamification_state` — materialized view por customer
- `gamification_identity` — junction Yogo↔phone↔email↔WA↔IG verified + 4 consent toggles + 3 pause flags + erasedAt tombstone
- `gamification_monthly_snapshot` — sealed period totals (Liga dos Campeões + audit)
- `gamification_reset_audit` — reset_id + status (started/applied_batch/completed/failed)
- `yogo_membership_snapshot` — daily diff source (user_id, paid_until, next_payment_date, status, status_text)

### 2.2 Identity resolution

3 eixos de lookup: **phone + email + IG handle verificado** (PATCH P16 — phone podia ser null nos dados reais).

```ts
findIdentity({ phone, email, igHandle }): Identity | null
```

Verificação IG via challenge code (bot DMs código → aluno responde do IG → match).

### 2.3 Polling Yogo (NO webhooks exist)

**Tier 1 — Class window:** `*/15 * * * *` durante operating hours (Lisbon 6h–23h)
- `GET /classes?startDate=today&populate[]=signups.user&populate[]=signups.user.image`
- Diff → `checkin_observed` events com `idempotencyKey = checkin:{customer_id}:{class_id}`
- **Spike 1 validado**: `signups.checked_in` é Unix ms; ordenação fiável até segundos

**Tier 2 — Memberships sweep:** `0 2 * * *` diário
- `POST /reports/memberships-list {}`
- Snapshot em `yogo_membership_snapshot`
- Diff vs ontem → emit:
  - `subscription_renewed` se `paid_until` avança ~1 mês
  - `subscription_cancelled` se `status: ended` ou `cancelled_running`
  - **`dunning_detected`** (PATCH P17) se `/falhou\|Pausado.*falhou/i.test(status_text)` muda false→true

### 2.4 Gating: classify() antes de creditar (PATCH P14)

Todo trigger que cria `pointsDelta > 0` valida primeiro:

```ts
import { classify } from "@/lib/yogo/classify";
const state = classify(membership, todayISO);
if (state !== "active") return; // skip credit
```

**Caso real (Spike 2):** user 1174940 tem `status: "active"` mas `status_text: "Pausado. Renovação automática falhou 4 vezes"`. Sem este gate, ganharia pontos por aulas sem estar a pagar.

### 2.5 Monthly reset (idempotent)

- Cron `0 2 1 * *` (02:00 Lisbon, day 1)
- INSERT INTO `gamification_reset_audit` com unique constraint em `status='running'`
- ON CONFLICT(customer_id, points_period) DO NOTHING para snapshots
- Recovery manual via "Force complete" no admin UI (NÃO auto-decide "30min = morto")

## 3. Ledger duplo

| Ledger | Comportamento | Propósito |
|---|---|---|
| `monthly_points` | Zera dia 1 | Ranking + prémios |
| `lifetime_xp` | Acumula (só baixa via erasure) | Qualificação patente |

Cada acção credita ambos. **XP sem boosts** (valor base); pontos com boosts (P4).

### 3.1 Erasure (PATCH P5 — two-track)

- **Track A** (default): tombstone identity, anonimiza event log payloads, zera state. **Pseudonimização honesta** (customer_id Yogo retido).
- **Track B** (≥12 meses após Track A, operador): hash customer_id, delete identity row. **Anonimização real** do lado StrikeLab.

## 4. Planos & milestones

### 4.1 Pontos por aula

| Plano | Preço | pointsPerClass | Full plan bonus | Perfect Week |
|---|---|---|---|---|
| P8 | €50 | 110 | +600 | ≥2/sem → +300 |
| P12 | €60 | 80 | +700 | ≥3/sem → +280 |
| Livre | €75 | 55 | n/a (milestones) | ≥4/sem → +220 |

### 4.2 Milestones por plano

**P8:** 4 aulas → +200 · 6 → +300 · 8 → +600 (full plan)
**P12:** 6 → +250 · 9 → +350 · 12 → +700 (full plan)
**Livre:** 8 → +200 · 12 → +300 · 16 → +400 · 20 → +500 (Atleta do Mês)

### 4.3 Detecção de plano real (Skill recipe B3)

Usar `pickBestMembership()` (status priority: active > cancelled_running > ended; tiebreaker: paid_until desc). **Não** confiar em `has_membership_membership_description`.

## 5. Triggers (one-shots — sem boost)

| Trigger | Pts | Condição |
|---|---|---|
| `renewal_processed` | +350 | `paid_until` avança ≥25 dias entre snapshots (Spike 2 validation) |
| ~~`early_renewal`~~ | — | **REMOVIDO** (D38) — auto-renew |
| `comeback` | +250 | Volta após ≥21 dias sem check-in |
| `dunning_detected` | 0 + msg | Status_text contém "falhou" pela 1ª vez |
| `low_usage_checkin` | 0 + msg neutra | dayOfMonth≥20 + classesThisMonth≤3 + sem pause flag |
| `supera_teu_ritmo` | +250 | classesThisWeek > plan.threshold |
| `streak_5` / `_10` / `_15` | activa boost | 5/10/15 dias seguidos |
| `streak_shield` | preserva | 1×/mês auto-applied |
| `full_plan_completion` | +600/700 | P8/P12 atingem totalClasses |
| `referral_trial_only` | +200 | Amigo faz trial sem converter |
| `referral_converted_phase_1` | +800 | Amigo inscreve-se |
| `referral_converted_phase_2` | +1200 | Amigo 6 check-ins + 1 renovação |
| `story_checkin` | +100 | Story <24h após check-in (UGC opt-in) |
| `story_no_class` | +50 (cap 1/sem) | Story sem check-in coupled |
| `feed_post` | +180 (cap 1/sem) | Post no feed com tag |
| `reel` | +250 (cap 1/mês) | Reel com tag |
| `repost_official` | +120 (cap 1/sem) | Repost de @strikershouseportugal |
| `weekly_challenge_won` | varia | Desafio semanal (§7) |
| `music_choice_accepted` | +50 (cap 2/sem) | Música escolhida aceite na playlist da aula (`WaSongRequest.status === "active"`). Phase 1 — Spotify integration já existe |
| `manual_adjustment` | livre | Marcelo no admin UI com reason |

**Removidos definitivamente:** `inactivity_long`, `broken_streak`, `embaixador_ratio` (boost), `atleta`, `mini_random`, `multi_class_same_day`, `decisionVote`, `store_purchase`.

> **Nota 2026-05-28:** `music_choice` reclassificado de "diferido V2" para Phase 1 trigger activo — integração Spotify já existe (`src/lib/spotify/*`, models `WaSongRequest`/`WaClassPlaylist`). Trata-se de contribuição à comunidade da casa.

## 6. Boosts

### 6.1 Stacking

```
finalMultiplier = min(1.0 + Σ(boost.delta), 3.0)
```

### 6.2 Scope rule (PATCH P4)

Boosts aplicam-se **APENAS** a `checkin_observed`. **NÃO** a one-shots (milestones, full_plan, renewal, referrals, supera_ritmo, weekly_challenge, manual_adjustment).

### 6.3 Definições

| Boost | × | Trigger | Duração |
|---|---|---|---|
| weekend | 1.8 | Sat/Sun | 48h cíclico |
| renovacao | 1.5 | `subscription_renewed` | 14d |
| streak_5 | 1.3 | streak ≥5 | até quebrar |
| streak_10 | 1.6 | streak ≥10 | até quebrar |
| streak_15 | 1.8 | streak ≥15 | até quebrar |
| ugc_story | 1.3 | `story_checkin` | 24h |
| ugc_post | 1.4 | `feed_post` | 48h |
| ugc_reel | 1.5 | `reel` | 72h |
| supera_ritmo | 1.2 | `supera_teu_ritmo` | fim de semana |
| embaixador_referral | 1.4 | `referral_phase_1` | 14d |

## 7. Desafios semanais

- **1×/semana** (não 2). Lançado quarta 12:00, fecha domingo 23:59.
- Pool fixo de 5; rotação sem repeat em 4 semanas.
- Seleção de vencedor: cron segunda 06:00 (`ORDER BY MIN(checked_in) ASC LIMIT winners_max`).
- **Spike 1 confirma** que `checked_in` Unix ms permite ordenação justa.

| Desafio | Mecânica | Pts | winners_max |
|---|---|---|---|
| Flash Check-in | Primeiros N a check-in em 24h | 250 | 5 |
| Story Theme | Story com tema do dia | 250 | 5 |
| Aula Lotada | Quem enche último lugar | 200 | 1 |
| Combo Surpresa | Combo anunciado em aula, report via bot | 250 | ilimitado |
| Hora H | Aula nomeada — quem aparece | 200 | ilimitado |

## 8. Patentes vitalícias (XP)

| Patente | Meses | minXP | Tempo realista P8 |
|---|---|---|---|
| Iniciante 🥚 | 0-3 | 0 | — |
| Bronze 🥉 | 3 | 5,000 | ~3 meses |
| Prata 🥈 | 6 | 15,000 | ~9-12 meses |
| Ouro 🥇 | 12 | 40,000 | ~24-30 meses |
| Diamante 💎 | 24 | 80,000 | ~45 meses + rubric |

**Diamante rubric (2-of-3):** Conduct + Engagement + Continuity.

**Benefícios condicionais a subscrição ACTIVE (`classify === "active"`)**:
- Bronze: 5% bootcamps (coupon Yogo)
- Prata: 5% desconto mensal + masterclass priority
- Ouro: 10% desconto + 1 PT/trimestre + masterclass seat
- Diamante: 15% desconto + sessão privada/mês + wall photo (consent flow) — `freeMonthsPerYear` **diferido V2** (sem Yogo coupon-for-month flow)

## 8.4 Categorias mensais (6 — adicionada Curador do Mês)

1. 🏆 Mais Aulas
2. 📸 Maior Embaixador (UGC + checkins coupled)
3. 🤝 Mais Trazedor (referrals)
4. 🔥 Maior Streak
5. 🎵 **Curador do Mês** — mais `music_choice_accepted` no mês (community contribution via Spotify)
6. 🥊 Mais Cross-trainer — diferido V2

## 9. Prémios mensais (adaptive thresholds — D36)

### 9.1 Thresholds iniciais

| Prémio | Pontos | Custo |
|---|---|---|
| Bronze | 2,500 | €8 |
| Silver | 5,000 | €25 |
| Gold | 8,500 | €40 |
| Diamond | 12,000 | 25% desc próximo mês |

### 9.2 Auto-tuning

```
mês N custo > 6% MRR → thresholds × 1.10 no mês N+1
3 meses < 5% MRR → freeze thresholds
```

Bot expõe `/limiares` para consulta.

### 9.3 Liga dos Campeões (PATCH P10 — no-exclusion)

Top 3 mês N ganham prémio normal + badge "Liga dos Campeões" durante mês N+1. Em N+1 competem **simultaneamente** no leaderboard regular E paralelo de badge-holders. Prémio paralelo: voucher masterclass (~€10). Nunca exclusão.

## 10. GDPR posture

### 10.1 Lawful basis

| Processing | Basis | Article |
|---|---|---|
| Check-in tracking | Contract | 6(1)(b) |
| Subscription/renewal | Contract | 6(1)(b) |
| UGC detection (/postei + IG↔check-in) | **Consent** (P9 — reverted from "contract") | 6(1)(a) |
| Ranking público | Consent | 6(1)(a) |
| Tier evaluation com efeito económico | Contract + admin confirmation | 6(1)(b) + Art. 22 |
| Anti-fraude | Legitimate interest (LIA) | 6(1)(f) |

### 10.2 Opt-in 4 toggles

Bot onboarding granular: training / UGC / real-name / broadcasts. Cada um revogável via `/optout [categoria]`.

### 10.3 Minores (PATCH P15)

- **<13:** excluídos
- **13-17:** consentimento parental escrito (paper, scaneado, `parentalConsentRef`)
- **DOB enforcement (Spike 4):** bot recusa onboarding se `date_of_birth IS NULL` no Yogo. Marcelo audita ~150 alunos antes do go-live para preencher.

### 10.4 Erasure (Patches P5)

Two-track (ver §3.1). Privacy notice §10.4 documenta honestly que Track A é pseudonimização.

### 10.5 Art. 22 admin confirmation

Tier promotion → evento `tier_change_proposed` na queue do admin. Marcelo confirma antes do benefício económico ser libertado. Aluno pode pedir revisão humana.

### 10.6 Retention

- 24m hot payload
- 25-60m cold (payload anonimizado, deltas numéricos preservados)
- >60m purged

### 10.7 DPO

- <250 subscritores ou sem inquérito CNPD → **não obrigatório**
- DPIA assinada por Ricardo (controller) + revisão externa de privacy lawyer (~€300 one-shot)
- Acima do threshold: fractional DPO contratado

## 11. Admin UI MVP (Phase 0)

13 ecrãs em `/dashboard/strikelab/*`:

1. List/search students (admin guard)
2. Per-student view (state + events 50 latest)
3. Manual points adjust (reason min 5 chars + audit)
4. Tier confirmation queue (Art. 22)
5. Tier override (com reason)
6. Pause flags (médica/férias/pessoal)
7. Prize redemption POS (debit + inventory)
8. UGC manual approve queue (ManyChat false negatives)
9. Discount apply tool (CSV ou POST — depende Spike 3)
10. Diamante review queue (rubric)
11. Duplicate suspect queue
12. Reset audit log (last 12)
13. Erasure handler (typed "APAGAR")

## 12. Phased rollout

| Phase | Sprint | Calendar | Effort | Entregáveis | Output ao aluno |
|---|---|---|---|---|---|
| 0 — Foundations | 1 | 2-3 semanas | ~38h | Schema, identity (phone+email+IG), polling, opt-in, classify(), GDPR docs, admin UI shell + 5 ecrãs | ❌ silent — pointsDelta=0 em todos os eventos |
| 1 — MVP gamificação | 2-3 | 5-6 semanas | ~110h | Pontos+XP, tiers, triggers core, boosts, monthly reset, prize POS, discount tool, **retroactive replay no launch** | ✅ pontos visíveis + tier + ranking |
| 2 — UGC + Social | 4-5 | 3-4 semanas | ~50h | ManyChat, referrals, weekly challenge, Champions League, music_choice | ✅ social + community |
| 3 — V2 | — | — | — | Cross-training, dupla auto, Diamante free months, governance forum | ✅ depth |

**MVP total: 10-13 semanas calendar.**

### 12.1 Retroactive credit no Phase 1 launch (decisão 2026-05-29)

Phase 0 corre em silêncio durante 2-3 semanas — `gamification_event_log` acumula `checkin_observed`, `subscription_renewed`, `comeback`, etc. com `pointsDelta=0` e `xpDelta=0`.

No **Day 1 do Phase 1 launch**, um job de migração faz **replay com pontos calculados** sobre todos os eventos pré-existentes:

```
Eventos elegíveis para retroactive credit:
  ✅ checkin_observed         → +pointsPerClass(plano)
  ✅ subscription_renewed     → +350 (mesmo valor)
  ✅ comeback                 → +250

Eventos NÃO elegíveis (gerados na altura sem semântica de pontos):
  ❌ tier_change_*            → tier eval acontece após o replay
  ❌ manual_adjustment        → já tinha pontos explícitos
  ❌ erasure_applied          → mantém zero
  ❌ consent_changed          → meta-event
```

**Boosts NÃO se aplicam retroactivamente.** Phase 0 não detecta nem activa boosts (weekend/streak/renovação). Replay credita só pontos BASE. Isto mantém o cálculo determinístico e não cria desigualdade injusta entre alunos que treinaram dentro/fora de eventos de boost.

**Streaks** *são* calculadas no replay — a partir de `checkin_observed` events ordenados por `createdAt`, o estado `currentStreakDays` é materializado, e se algum aluno tiver atingido 5/10/15 dias durante Phase 0, o boost activa-se a partir do Day 1 do Phase 1 (não retroactivamente).

**Mensagem de lançamento WhatsApp Phase 1 Day 1**:
> 🎉 Bem-vindo ao StrikeLab.
> Já tinhas {pointsBalance} pontos das últimas {weeks} semanas — bom começo!
> Patente actual: {tier}.
> A partir de hoje, cada treino vale pontos. Bom trabalho 💪

**Implementação Phase 1 — Task 0**:
- Cron `strikelab-retroactive-replay` (one-shot, run once on Phase 1 deploy)
- Lock via `gamification_meta` row para garantir replay corre 1× exacto
- Audit row: `retroactive_replay_completed` com `eventsReplayed`, `customersAffected`, `totalPointsCredited`
- Idempotente: se correr 2×, segunda vez é no-op (`pointsAlreadyReplayed=true` flag por customer)

**Cap de safety**: pontos retroactivos por aluno não excedem `1.5× monthlyPointsCap` (≈ 9,000 pts para P12 maxado). Evita catástrofes se Phase 0 correr mais do que previsto.

## 13. Cut list definitiva

- `inactivity_long -50` (D1)
- `broken_streak -30` (D2)
- `embaixador_ratio` boost (D3)
- `atleta` boost (D4)
- `mini_random` (D5)
- `multi_class_same_day "variable"` (D6)
- `decisionVote` Diamante (D7)
- `early_renewal` (D38 — auto-renew)
- `store_purchase` (sem loja built)
- ~~`music_choice` (sem integration)~~ — RECLASSIFICADO para Phase 1 — integração já existe
- 2×/semana weekly challenges (→ 1×)
- "1 mês grátis" prize (→ 25% desconto)

## 14. Open Questions resolvidas (todas)

| # | Question | Decisão |
|---|---|---|
| 1 | Vercel Pro 15-min cron | DG-1 pendente — sugerido Pro; Hobby fallback documentado |
| 2 | Yogo coupon programatico | Pending Spike 3 — fallback CSV |
| 3 | WhatsApp Cloud migration | Stay custom para Phase 0 |
| 4 | Menores existentes | Audit task no plano (Spike 4 input) |
| 5 | DPO designation | Privacy lawyer ~€300 one-shot, sem DPO contratado |
| 6 | Legacy discounts | Diferido para Phase 1 plan |
| 7 | Champions League prize | Voucher masterclass (~€10) |
| 8 | Anti-ring threshold | 60d window + 3 referrals/90d starting point |

## Próximo

→ Execução via [[StrikeLab-Phase-0-Plan-Final]]
