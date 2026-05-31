---
title: StrikeLab — Coverage Matrix (Spec ↔ Docs ↔ Implementação)
type: technical
status: live tracking
created: 2026-05-28
owner: Ricardo
tags:
  - strikelab
  - coverage
  - traceability
  - reference
related:
  - "[[StrikeLab-Pontuacao-Mapa]]"
  - "[[StrikeLab-v3.2-final]]"
  - "[[Yogo-StrikeLab-Gap-Report]]"
---

# StrikeLab — Coverage Matrix

> Para cada mecânica do sistema: onde está documentada, onde será implementada, qual o estado actual. Vista de completude para o Ricardo confirmar que nada cai entre rachas.

Ver também: [[StrikeLab-Pontuacao-Mapa]] (mecânicas detalhadas) · [[StrikeLab-v3.2-final]] (spec) · Plano: `docs/superpowers/plans/2026-05-28-strikelab-phase-0-final.md`

## Legenda de status

| Símbolo | Significado |
|---|---|
| 📋 specd | Especificado mas ainda não atribuído a tarefa |
| 🗓️ scheduled | Atribuído a tarefa específica no plano |
| 🔨 in-progress | Implementação em curso |
| ✅ shipped | Em produção |
| ⏳ deferred | Diferido para fase posterior |
| ❌ cut | Removido / não fará parte |

---

## 1. Storage & arquitectura

| Componente | Spec | Plano Phase 0 | Plano Phase 1 | Status |
|---|---|---|---|---|
| `gamification_event_log` schema | [[StrikeLab-v3.2-final#2.1 Storage]] | Task 2 | — | 🗓️ |
| `gamification_state` schema | [[StrikeLab-v3.2-final#2.1 Storage]] | Task 2 | — | 🗓️ |
| `gamification_identity` schema | [[StrikeLab-v3.2-final#2.1 Storage]] | Task 2 | — | 🗓️ |
| `gamification_monthly_snapshot` schema | [[StrikeLab-v3.2-final#2.1 Storage]] | Task 2 | — | 🗓️ |
| `gamification_reset_audit` schema | [[StrikeLab-v3.2-final#2.5 Monthly reset]] | Task 2 | — | 🗓️ |
| `yogo_membership_snapshot` schema | [[Yogo-StrikeLab-Gap-Report]] | Task 2 | — | 🗓️ |
| Idempotent event log writer | [[StrikeLab-v3.2-final#2.1]] | Task 3 | — | 🗓️ |
| State materialization (replay) | [[StrikeLab-v3.2-final#2.1]] | Task 4 | — | 🗓️ |
| Single-writer per customer (race-free) | [[StrikeLab-v3.2-final#2.5]] | Task 4 | — | 🗓️ |
| Monthly reset (idempotent) | [[StrikeLab-v3.2-final#2.5]] | — | Phase 1 task | ✅ |
| Append-then-materialize pattern | [[StrikeLab-v3.2-final#2 Arquitectura]] | Tasks 3, 4 | — | 🗓️ |
| Storage growth retention (24m hot, 60m cold) | [[StrikeLab-v3.2-final#10.6 Retention]] | Task 18 (docs) | Phase 1 cron | 🗓️ + 📋 |

## 2. Identity & onboarding

| Componente | Spec | Plano Phase 0 | Plano Phase 1 | Status |
|---|---|---|---|---|
| Yogo customer ↔ phone lookup | [[StrikeLab-v3.2-final#2.2]] | Task 5 (existing `src/lib/yogo/lookup.ts`) | — | ✅ partial |
| Yogo customer ↔ email lookup (PATCH P16) | [[StrikeLab-v3.2-final#2.2]] | Task 5 (NEW) | — | 🗓️ |
| IG handle verification (challenge code) | [[StrikeLab-v3.2-final#2.2]] | Task 5 | — | 🗓️ |
| WhatsApp wa_id ↔ identity | [[StrikeLab-v3.2-final#2.2]] | Task 5 | — | 🗓️ |
| 4-toggle opt-in (training/UGC/realName/broadcasts) | [[StrikeLab-v3.2-final#10.2]] | Task 6 + Task 12 | — | 🗓️ |
| `/optout [categoria]` bot command | [[StrikeLab-v3.2-final#10.2]] | Task 12 | — | 🗓️ |
| DOB enforcement (PATCH P15) | [[StrikeLab-Pontuacao-Mapa#7 Gates de credit]] | Task 12 + Task 16 (audit) | — | 🗓️ |
| Parental consent flow (13-17) | [[StrikeLab-v3.2-final#10.3 Minores]] | Task 12 (paper trail) | — | 🗓️ |
| <13 exclusão | [[StrikeLab-v3.2-final#10.3 Minores]] | Task 12 | — | 🗓️ |
| Pause flags (medical/vacation/personal) | [[StrikeLab-v3.2-final#11]] | Task 15 | — | 🗓️ |
| Erasure two-track (Art. 17) | [[StrikeLab-v3.2-final#3.1 Erasure]] | Task 13 | — | 🗓️ |

## 3. Yogo integration & gates

| Componente | Spec | Plano Phase 0 | Plano Phase 1 | Status |
|---|---|---|---|---|
| Polling /classes 15min (operating hours) | [[StrikeLab-v3.2-final#2.3 Polling Yogo]] | Task 8 + Task 10 + Task 11 | — | 🗓️ |
| Polling memberships daily 02:00 | [[StrikeLab-v3.2-final#2.3]] | Task 9 + Task 10 + Task 11 | — | 🗓️ |
| Snapshot-diff strategy | [[Yogo-StrikeLab-Gap-Report]] | Task 9 | — | 🗓️ |
| `classify()` function (PATCH B2) | [[StrikeLab-Pontuacao-Mapa#7.1 classify()]] | Task 7 | — | 🗓️ |
| `pickBestMembership()` (PATCH B3) | [[StrikeLab-v3.2-final#4.3]] | Task 7 | — | 🗓️ |
| `isNonActionableLead()` filter (PATCH B4) | [[StrikeLab-v3.2-final#2.3]] | Task 7 | — | 🗓️ |
| Credit gate G4: classify === active (PATCH P14) | [[StrikeLab-Pontuacao-Mapa#7]] | Task 8 + Task 9 (apply) | — | 🗓️ |
| Renewal detection (snapshot diff paid_until) | [[Yogo-StrikeLab-Gap-Report]] | Task 9 | — | 🗓️ |
| Dunning detection (regex status_text) (PATCH P17) | [[StrikeLab-Pontuacao-Mapa#4.3]] | Task 9 | — | 🗓️ |
| DOB passive capture from signups.user | [[Yogo-StrikeLab-Gap-Report]] | Task 8 | — | 🗓️ |
| Yogo discount code POST (Spike 3) | [[Yogo-StrikeLab-Gap-Report]] | Task 17 manual | Phase 1 discount tool | ⏳ |

## 4. Triggers — créditos de pontos/XP

### 4.1 Treino & presença

| Trigger | Pontos | Spec | Phase 0 (estrutural) | Phase 1 (lógica) | Status |
|---|---|---|---|---|---|
| `checkin_observed` | pointsPerClass | [[StrikeLab-Pontuacao-Mapa#4.1]] | Task 8 (event shell, pts=0) | Phase 1: add plan-aware pointsPerClass | 🗓️ + 📋 |
| `perfect_week` | 300/280/220 | [[StrikeLab-Pontuacao-Mapa#3.4]] | — | Phase 1 task | 📋 |
| `full_plan_completion` | 600/700 | [[StrikeLab-Pontuacao-Mapa#3.1]] | — | Phase 1 task | 📋 |
| `p8_milestone` (4/6) | 200/300 | [[StrikeLab-Pontuacao-Mapa#3.1]] | — | Phase 1 task | 📋 |
| `p12_milestone` (6/9) | 250/350 | [[StrikeLab-Pontuacao-Mapa#3.2]] | — | Phase 1 task | 📋 |
| `livre_milestone` (8/12/16/20) | 200/300/400/500 | [[StrikeLab-Pontuacao-Mapa#3.3]] | — | Phase 1 task | 📋 |
| `supera_teu_ritmo` | +250 | [[StrikeLab-Pontuacao-Mapa#4.1]] | — | Phase 1 task | 📋 |

### 4.2 Streaks

| Trigger | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| `streak_5/10/15_activated` | [[StrikeLab-Pontuacao-Mapa#4.2]] | — | Phase 1 task | 📋 |
| `streak_shield_used` | [[StrikeLab-Pontuacao-Mapa#4.2]] | — | Phase 1 task | 📋 |
| Shield reset day 1 | [[StrikeLab-v3.2-final#5.4]] | — | Phase 1 (with monthly reset cron) | 📋 |

### 4.3 Renovação & retenção

| Trigger | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| `subscription_renewed` (+350) | [[StrikeLab-Pontuacao-Mapa#4.3]] | Task 9 (detection) | Phase 1 (credit) | 🗓️ + 📋 |
| `comeback` (+250) | [[StrikeLab-Pontuacao-Mapa#4.3]] | Task 9 (detection) | Phase 1 (credit) | 🗓️ + 📋 |
| `dunning_detected` (alerta) (PATCH P17) | [[StrikeLab-Pontuacao-Mapa#4.3]] | Task 9 | — | 🗓️ |
| `low_usage_checkin` (msg neutra) | [[StrikeLab-Pontuacao-Mapa#4.3]] | — | Phase 1 cron | 📋 |
| ~~`early_renewal`~~ (D38) | — | — | — | ❌ cut |

### 4.4 Crescimento (referrals)

| Trigger | Spec | Phase 0 | Phase 2 | Status |
|---|---|---|---|---|
| `referral_trial_only` (+200) | [[StrikeLab-Pontuacao-Mapa#4.4]] | — | Phase 2 task | 📋 |
| `referral_phase_1` (+800 + boost) | [[StrikeLab-Pontuacao-Mapa#4.4]] | — | Phase 2 task | 📋 |
| `referral_phase_2` (+1200) | [[StrikeLab-Pontuacao-Mapa#4.4]] | — | Phase 2 task (cron check) | 📋 |
| Anti-ring detection | [[StrikeLab-Pontuacao-Mapa#12.2]] | — | Phase 2 task | 📋 |
| Phased payout requires 6 checkins + 1 renewal | [[StrikeLab-Pontuacao-Mapa#12.1]] | — | Phase 2 task | 📋 |

### 4.5 UGC

| Trigger | Spec | Phase 0 | Phase 2 | Status |
|---|---|---|---|---|
| `story_checkin` (+100 + boost) | [[StrikeLab-Pontuacao-Mapa#4.5]] | — | Phase 2 task | 📋 |
| `story_no_class` (+50) | [[StrikeLab-Pontuacao-Mapa#4.5]] | — | Phase 2 task | 📋 |
| `repost_official` (+120) | [[StrikeLab-Pontuacao-Mapa#4.5]] | — | Phase 2 task | 📋 |
| `feed_post` (+180 + boost) | [[StrikeLab-Pontuacao-Mapa#4.5]] | — | Phase 2 task | 📋 |
| `reel` (+250 + boost) | [[StrikeLab-Pontuacao-Mapa#4.5]] | — | Phase 2 task | 📋 |
| `/postei` bot command (default UGC) | [[StrikeLab-v3.2-final#10.1]] | — | Phase 2 task | 📋 |
| ManyChat integration (opt-in upgrade) | [[StrikeLab-v3.2-final#10.1]] | — | Phase 2 task | 📋 |
| UGC manual approve queue (admin) | [[StrikeLab-v3.2-final#11]] | — | Phase 2 task | 📋 |

### 4.6 Desafios semanais

| Componente | Spec | Phase 0 | Phase 2 | Status |
|---|---|---|---|---|
| Weekly challenge cron Wed 12:00 | [[StrikeLab-Pontuacao-Mapa#4.6]] | — | Phase 2 task | 📋 |
| Pool de 5 desafios + rotation no-repeat 4 weeks | [[StrikeLab-Pontuacao-Mapa#4.6]] | — | Phase 2 task | 📋 |
| Marcelo override no admin UI | [[StrikeLab-v3.2-final#7]] | — | Phase 2 task | 📋 |
| Winner selection cron Mon 06:00 | [[StrikeLab-v3.2-final#7]] | — | Phase 2 task | 📋 |
| `winners_max` per challenge type | [[StrikeLab-Pontuacao-Mapa#4.6]] | — | Phase 2 task | 📋 |

### 4.7 Música & Comunidade (NEW 2026-05-28)

| Componente | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| `music_choice_accepted` (+50, cap 2/sem) | [[StrikeLab-Pontuacao-Mapa#4.7]] | — | Phase 1 task — wire ao success path do `song-request.ts` | 📋 |
| Sem boost (intencional) | [[StrikeLab-Pontuacao-Mapa#4.7]] | — | Phase 1 | 📋 |
| Skip nos estados rejeitados (genre/artist/window/cancelled/swapped) | [[StrikeLab-Pontuacao-Mapa#4.7]] | — | Phase 1 | 📋 |
| 🎵 Curador do Mês categoria | [[StrikeLab-Pontuacao-Mapa#8.3]] | — | Phase 1 (parte do prémio mensal) | 📋 |

## 5. Boosts

### 5.1 Definições

| Boost | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| `weekend` (1.8×) | [[StrikeLab-Pontuacao-Mapa#5]] | — | Phase 1 task | 📋 |
| `renovacao` (1.5×, 14d) | [[StrikeLab-Pontuacao-Mapa#5]] | — | Phase 1 task | 📋 |
| `streak_5/10/15` (1.3/1.6/1.8) | [[StrikeLab-Pontuacao-Mapa#5]] | — | Phase 1 task | 📋 |
| `ugc_story/post/reel` (1.3/1.4/1.5) | [[StrikeLab-Pontuacao-Mapa#5]] | — | Phase 2 task | 📋 |
| `supera_ritmo` (1.2×) | [[StrikeLab-Pontuacao-Mapa#5]] | — | Phase 1 task | 📋 |
| `embaixador_referral` (1.4×) | [[StrikeLab-Pontuacao-Mapa#5]] | — | Phase 2 task | 📋 |

### 5.2 Stacking

| Componente | Spec | Phase 1 | Status |
|---|---|---|---|
| Delta-sum formula | [[StrikeLab-Pontuacao-Mapa#6]] | Phase 1 task | 📋 |
| Cap 3.0× absoluto | [[StrikeLab-Pontuacao-Mapa#6]] | Phase 1 task | 📋 |
| Boost scope rule (PATCH P4) | [[StrikeLab-Pontuacao-Mapa#5]] | Phase 1 task | 📋 |

### 5.3 Removidos

| Boost removido | Razão | Status |
|---|---|---|
| `atleta` (D4) | favorecia plano caro | ❌ cut |
| `embaixador_ratio` (D3) | perverse incentive | ❌ cut |
| `mini_random` (D5) | selecção opaca | ❌ cut |

## 6. Patentes (XP-based)

| Componente | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| 5 patentes (Iniciante → Diamante) | [[StrikeLab-Pontuacao-Mapa#10]] | Task 2 (schema state.currentTier) | Phase 1 task (eval cron) | 🗓️ + 📋 |
| XP thresholds (5k/15k/40k/80k) | [[StrikeLab-Pontuacao-Mapa#10]] | — | Phase 1 task | 📋 |
| Diamante rubric (2-of-3 manual) | [[StrikeLab-Pontuacao-Mapa#10.1]] | — | Phase 1 admin queue | 📋 |
| Art. 22 confirmation queue | [[StrikeLab-v3.2-final#10.5]] | Task 2 (state.proposedTier) | Phase 1 admin UI + cron | 🗓️ + 📋 |
| Tier evaluation nightly cron | [[StrikeLab-v3.2-final#2.4]] | — | Phase 1 task | 📋 |

## 7. Benefícios de patente

| Benefício | Tier | Spec | Phase 1 | Phase 2 | Status |
|---|---|---|---|---|---|
| 5% bootcamps | Bronze | [[StrikeLab-Pontuacao-Mapa#11]] | Phase 1 discount tool | — | 📋 |
| 5% desconto mensal | Prata | [[StrikeLab-Pontuacao-Mapa#11]] | Phase 1 batch generator | — | 📋 |
| Masterclass priority | Prata | [[StrikeLab-v3.2-final#8.2]] | — | Phase 2 admin tool | 📋 |
| Welcome-to-Silver brinde | Prata | [[StrikeLab-v3.2-final#8.2]] | Phase 1 POS | — | 📋 |
| 10% desconto mensal | Ouro | [[StrikeLab-Pontuacao-Mapa#11]] | Phase 1 batch | — | 📋 |
| 1 PT session/trimestre | Ouro | [[StrikeLab-v3.2-final#8.2]] | Phase 1 ticket queue | — | 📋 |
| Masterclass seat reservado | Ouro | [[StrikeLab-v3.2-final#8.2]] | — | Phase 2 admin tool | 📋 |
| 15% desconto mensal | Diamante | [[StrikeLab-Pontuacao-Mapa#11]] | Phase 1 batch | — | 📋 |
| Sessão privada/mês | Diamante | [[StrikeLab-v3.2-final#8.2]] | Phase 1 ticket queue | — | 📋 |
| Wall photo (com consent) | Diamante | [[StrikeLab-v3.2-final#8.3]] | — | Phase 2 consent flow | 📋 |
| ~~Free months per year~~ | Diamante | [[StrikeLab-v3.2-final#8.2]] | — | — | ⏳ V2 |

## 8. Prémios mensais

| Componente | Spec | Phase 1 | Status |
|---|---|---|---|
| 4 tiers (Bronze/Silver/Gold/Diamond) | [[StrikeLab-Pontuacao-Mapa#8.1]] | Phase 1 task | 📋 |
| Adaptive thresholds (PATCH P1) | [[StrikeLab-Pontuacao-Mapa#8.2]] | Phase 1 task | 📋 |
| Bot `/limiares` command | [[StrikeLab-v3.2-final#9]] | Phase 1 task | 📋 |
| 5 categorias (mais aulas, embaixador, etc.) | [[StrikeLab-Pontuacao-Mapa#8.3]] | Phase 1 task | 📋 |
| Cross-trainer category | — | — | ⏳ V2 |
| Liga dos Campeões parallel (PATCH P10) | [[StrikeLab-Pontuacao-Mapa#9]] | Phase 1 task | 📋 |
| Prize POS redemption | [[StrikeLab-v3.2-final#11]] | Phase 1 admin UI | 📋 |
| Prize inventory tracking | [[StrikeLab-v3.2-final#11]] | Phase 1 admin UI | 📋 |
| Prize-cap toggle admin | [[StrikeLab-v3.2-final#11]] | Phase 1 admin UI | 📋 |

## 9. Admin UI

| Ecrã | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| List/search students | [[StrikeLab-v3.2-final#11]] | Task 14 | — | 🗓️ |
| Per-student view (50 events) | [[StrikeLab-v3.2-final#11]] | Task 14 | — | 🗓️ |
| Manual points adjust + reason | [[StrikeLab-v3.2-final#11]] | Task 15 | — | 🗓️ |
| Pause flags admin | [[StrikeLab-v3.2-final#11]] | Task 15 | — | 🗓️ |
| Reset audit log (last 12) | [[StrikeLab-v3.2-final#11]] | Task 15 | — | 🗓️ |
| Erasure handler (typed APAGAR) | [[StrikeLab-v3.2-final#11]] | Task 13+15 | — | 🗓️ |
| Tier confirmation queue (Art. 22) | [[StrikeLab-v3.2-final#10.5]] | — | Phase 1 | 📋 |
| Tier override (com reason) | [[StrikeLab-v3.2-final#11]] | — | Phase 1 | 📋 |
| Prize redemption POS | [[StrikeLab-v3.2-final#11]] | — | Phase 1 | 📋 |
| UGC manual approve queue | [[StrikeLab-v3.2-final#11]] | — | Phase 2 | 📋 |
| Discount apply tool (CSV ou POST) | [[StrikeLab-v3.2-final#11]] | — | Phase 1 (CSV) / spike 3 (POST) | 📋 |
| Diamante review queue + rubric | [[StrikeLab-Pontuacao-Mapa#10.1]] | — | Phase 1 | 📋 |
| Duplicate suspect queue | [[StrikeLab-v3.2-final#11]] | — | Phase 2 | 📋 |
| Inventory manual stock counts | [[StrikeLab-v3.2-final#11]] | — | Phase 1 | 📋 |

## 10. GDPR / compliance

| Componente | Spec | Phase 0 | Status |
|---|---|---|---|
| DPIA | [[StrikeLab-v3.2-final#10.7]] | Task 18 | 🗓️ |
| ROPA (Art. 30) | [[StrikeLab-v3.2-final#10]] | Task 18 | 🗓️ |
| Lawful Basis Register | [[StrikeLab-v3.2-final#10.1]] | Task 18 | 🗓️ |
| Retention Policy (24m hot, 60m cold) | [[StrikeLab-v3.2-final#10.6]] | Task 18 | 🗓️ |
| Processor Agreements tracker (Yogo, Vercel, Turso, ManyChat) | [[StrikeLab-v3.2-final#10]] | Task 18 | 🗓️ |
| Privacy notice public (pt-PT) | [[StrikeLab-v3.2-final#10]] | Task 19 | 🗓️ |
| Granular opt-in capture | [[StrikeLab-v3.2-final#10.2]] | Task 6 + 12 | 🗓️ |
| Right to erasure flow | [[StrikeLab-v3.2-final#3.1]] | Task 13 | 🗓️ |
| Art. 22 admin confirmation | [[StrikeLab-v3.2-final#10.5]] | Task 2 (schema) | 🗓️ |
| <13 exclusão / 13-17 parental | [[StrikeLab-v3.2-final#10.3]] | Task 12 | 🗓️ |
| External lawyer review ~€300 (DG-2) | [[StrikeLab-v3.2-final#10.7]] | Task 18 + DG-2 decision | 🗓️ |
| DOB enforcement audit | [[StrikeLab-Pontuacao-Mapa#7]] | Task 16 | 🗓️ |

## 11. Sistema (operacional)

| Componente | Spec | Phase 0 | Phase 1 | Status |
|---|---|---|---|---|
| Cron `*/15 * * * *` classes (DG-1: Vercel Pro) | [[StrikeLab-v3.2-final#2.3]] | Task 11 | — | 🗓️ + DG-1 |
| Cron `0 2 * * *` memberships | [[StrikeLab-v3.2-final#2.3]] | Task 11 | — | 🗓️ |
| Cron `0 2 1 * *` monthly reset | [[StrikeLab-v3.2-final#2.5]] | — | Phase 1 task | ✅ |
| Reset audit + force complete | [[StrikeLab-v3.2-final#2.5]] | Task 15 (UI) + Phase 1 (logic) | 🗓️ + 📋 |
| Hourly fallback (sem Vercel Pro) | Plano final §11 | Task 11 conditional | — | 🗓️ |
| Feature flags (`STRIKELAB_*_ENABLED`) | Plano final | Task 1 | — | 🗓️ |

## 12. Cuts e diferimentos

### Removidos definitivamente (não fará parte)

| Item | Razão | Status |
|---|---|---|
| `inactivity_long -50pts` | Discriminação saúde (Carla feedback) | ❌ cut (D1) |
| `broken_streak -30pts` | Insulto adicional | ❌ cut (D2) |
| `embaixador_ratio` boost | Perverse incentive | ❌ cut (D3) |
| `atleta` Livre boost | Favorecia plano caro | ❌ cut (D4) |
| `mini_random` boost | Selecção opaca | ❌ cut (D5) |
| `multi_class_same_day "variable"` | Exploit indefinido | ❌ cut (D6) |
| `decisionVote: true` Diamante | Governance indefinida | ❌ cut (D7) |
| `early_renewal` trigger | Auto-renew na Strike House | ❌ cut (D38) |
| 2× weekly challenges | Marcelo não cura | ❌ cut |
| "1 mês grátis" prize | Accounting fiction (€10 vs €50-75) | ❌ cut (D17) → 25% desc |
| Liga dos Campeões "exílio" | Engagement collapse | ❌ cut (P10) → parallel |

### Diferidos para V2

| Item | Razão | Status |
|---|---|---|
| `cross_training` trigger | Yogo modality não mapeada | ⏳ V2 |
| `dupla` trigger | Atrito; requer auto-detection | ⏳ V2 |
| Diamante `freeMonthsPerYear` | Sem Yogo coupon-for-month flow | ⏳ V2 |
| ~~`music_choice` trigger~~ | ~~Sem Spotify integration~~ | **Reclassificado 2026-05-28 → Phase 1** (integração existe em `src/lib/spotify/*`) |
| `store_purchase` trigger | Sem store API | ⏳ V2 |
| Cross-trainer prize category | Depende cross_training trigger | ⏳ V2 |
| Wall photo Diamante (active flow) | Precisa consent flow scratch | ⏳ V2 |
| Governance forum (replacement for decisionVote) | Design ainda não existente | ⏳ V2 |
| Story-organic re-evaluation | Só se dano económico provado | ⏳ V2 |

## 13. Open Questions (Decision Gates)

| # | Gate | Status | Blocks |
|---|---|---|---|
| DG-1 | Vercel Pro upgrade | 🔓 pendente decisão | Task 11 cron registration |
| DG-2 | Privacy lawyer review (~€300) | 🔓 pendente decisão | Task 18 DPIA |
| DG-3 | DOB audit existing subscribers | 🔓 pendente Task 16 | Task 12 onboarding copy |
| DG-4 | Privacy notice URL `/privacy/strikelab` | ✅ default aceite | — |
| DG-5 | Legacy discount grandfathering | ⏳ diferido Phase 1 | Phase 1 plan |

## 14. Spikes Yogo

| # | Spike | Status | Findings |
|---|---|---|---|
| 1 | Check-in timestamps | ✅ DONE | `signups.checked_in` Unix ms confirmado (Spike 1) |
| 2 | Renewal detection fields | ✅ DONE | Snapshot-diff `paid_until`; dunning real case validado (Spike 2) |
| 3 | Discount code POST | ⏳ PENDING | Manual DevTools — Task 17. Fallback CSV documentado |
| 4 | DOB / user detail | ✅ DONE | DOB opcional → audit manual antes go-live (Spike 4) |

## Total counts

| Categoria | Total | 🗓️ scheduled | 📋 specd | ❌ cut | ⏳ deferred |
|---|---|---|---|---|---|
| Storage & arquitectura | 12 | 11 | 1 | 0 | 0 |
| Identity & onboarding | 11 | 11 | 0 | 0 | 0 |
| Yogo integration & gates | 11 | 10 | 0 | 0 | 1 |
| Triggers | 36 | 7 | 18 | 2 | 9 |
| Triggers — Música (NEW) | 4 | 0 | 4 | 0 | 0 |
| Boosts | 14 | 0 | 9 | 3 | 2 |
| Patentes | 5 | 2 | 3 | 0 | 0 |
| Benefícios patente | 11 | 0 | 9 | 0 | 2 |
| Prémios mensais | 9 | 0 | 8 | 0 | 1 |
| Admin UI | 14 | 5 | 9 | 0 | 0 |
| GDPR/compliance | 12 | 12 | 0 | 0 | 0 |
| Sistema operacional | 6 | 5 | 1 | 0 | 0 |
| **TOTAL** | **145** | **63 (43%)** | **62 (43%)** | **5 (3%)** | **15 (11%)** |

Phase 0 cobre **63 items** (43%) — fundação completa para Phase 1 construir os 62 items de gamificação activa (incluindo 4 novos da subsecção Música & Comunidade).

## Changelog

- **2026-05-28**: `music_choice` reclassificado de ⏳ V2 → 🗓️ Phase 1. Adicionada subsecção 4.7 Música & Comunidade (4 items). Adicionada categoria "🎵 Curador do Mês". Spotify integration já existe em `src/lib/spotify/*`.
- **2026-05-29**: Decisão estratégica — **Phase 0 standalone + retroactive credit no Phase 1 launch**. Phase 0 ledger corre em silêncio (`pointsDelta=0`); Phase 1 Day 1 faz replay com pontos calculados. Alunos arrancam com pontos das últimas semanas. Phase 1 plan ganha "Task 0 — retroactive_replay" no preâmbulo. Sem impacto no Phase 0 plan actual. Ver [[StrikeLab-v3.2-final#12.1]].
