---
title: StrikeLab — Mapa Completo do Sistema de Pontuação
type: technical
status: spec-locked v3.2-final
version: 3.2-final
created: 2026-05-28
owner: Ricardo
tags:
  - strikelab
  - gamification
  - scoring
  - reference
related:
  - "[[StrikeLab-v3.2-final]]"
  - "[[Yogo-StrikeLab-Gap-Report]]"
  - "[[StrikeLab-Cobertura]]"
  - "[[StrikeLab-Fluxo.canvas]]"
---

# StrikeLab — Mapa Completo do Sistema de Pontuação

> **Visão de completude.** Cada mecânica que move um ponto, XP, boost, badge ou benefício — listada aqui. Se algo não está aqui, não existe na v3.2-final.

Ver também: [[StrikeLab-v3.2-final]] · [[StrikeLab-Cobertura]] · [[StrikeLab-Fluxo.canvas|Fluxo visual]] · [[Yogo-StrikeLab-Gap-Report]]

## Índice

1. [[#1 Ledger duplo]] — Pontos do Mês vs XP Lifetime
2. [[#2 Pontos base por aula]] — Por plano
3. [[#3 Bónus de plano]] — Milestones, perfect week, full plan
4. [[#4 Triggers — tabela completa]] — Todos os eventos que creditam
5. [[#5 Boosts — tabela completa]] — Todos os multiplicadores
6. [[#6 Formula de stacking]] — Cap 3.0× + worked examples
7. [[#7 Gates de credit]] — classify(), pause, opt-in
8. [[#8 Prémios mensais]] — Tiers + auto-tuning
9. [[#9 Liga dos Campeões]] — Parallel leaderboard
10. [[#10 Patentes vitalícias]] — XP thresholds + tempos por plano
11. [[#11 Benefícios condicionais]] — Por patente + delivery mechanism
12. [[#12 Anti-fraude]] — Referral phasing, anti-ring, caps
13. [[#13 Mensagens pt-PT]] — Strings por trigger
14. [[#14 Cortes definitivos]] — O que foi removido
15. [[#15 Reverse lookup]] — "Como ganho mais X?"

---

## 1 Ledger duplo

> [!info] Princípio central
> Toda acção que credita pontos credita simultaneamente XP. XP é base (sem boosts), pontos podem ter boosts.

| Ledger | Comportamento | Determina | Persistência |
|---|---|---|---|
| `monthly_points` | Zera dia 1 do mês (02:00 Lisbon) | Ranking + resgate de prémios | Sealed em `gamification_monthly_snapshot` |
| `lifetime_xp` | Acumula para sempre | Patente vitalícia | Permanente (excepto via erasure) |

Implementação: [[StrikeLab-v3.2-final#2.1 Storage]] · materialização via `src/lib/gamification/state.ts`

---

## 2 Pontos base por aula

| Plano | Preço | pointsPerClass | Aulas típicas/mês | Total base/mês típico |
|---|---|---|---|---|
| P8 | €50 | **110** | 8 | 880 |
| P12 | €60 | **80** | 12 | 960 |
| Livre | €75 | **55** | 16-20 | 880-1100 |

> [!note] Por que estes valores?
> Calibração v3.2: €/ponto ≈ €0.057 (era €0.83 com Livre dominante). Os 3 planos competem em footing similar.

Trigger técnico: `checkin_observed`
Source: `yogo_poll` (poll de 15min sobre `GET /classes?populate[]=signups.user`)
Idempotency key pattern: `checkin:{customerId}:{classId}`

---

## 3 Bónus de plano

### 3.1 Milestones — Plano 8

| Aulas no mês | Bónus | Label |
|---|---|---|
| 4 | +200 | "Meio Caminho" |
| 6 | +300 | "Quase Lá" |
| 8 | +600 | "Plano Cheio" (full_plan_completion) |

### 3.2 Milestones — Plano 12

| Aulas no mês | Bónus | Label |
|---|---|---|
| 6 | +250 | "Meio Plano" |
| 9 | +350 | "75%" |
| 12 | +700 | "Plano Cheio" (full_plan_completion) |

### 3.3 Milestones — Plano Livre

| Aulas no mês | Bónus | Extra |
|---|---|---|
| 8 | +200 | — |
| 12 | +300 | — |
| 16 | +400 | — |
| 20 | +500 | Badge "Atleta do Mês" |

> Livre não tem `full_plan_completion` — usa milestones progressivos porque o plano não tem tecto.

### 3.4 Perfect Week (qualquer plano)

| Plano | Threshold (aulas/semana) | Bónus |
|---|---|---|
| P8 | ≥2 | +300 |
| P12 | ≥3 | +280 |
| Livre | ≥4 | +220 |

Calculado domingo 23:59 Lisbon. Trigger: `perfect_week`. Idempotency: `perfect_week:{customerId}:{isoWeek}`.

---

## 4 Triggers — tabela completa

> [!important] Lei: triggers NÃO recebem boost
> Boosts aplicam-se APENAS a `checkin_observed` (PATCH P4). Todos os one-shots abaixo são flat.

### 4.1 Treino & presença

| Trigger | Pontos | Condição | Source | Idempotency | Cap |
|---|---|---|---|---|---|
| `checkin_observed` | pointsPerClass | check-in detectado | yogo_poll | `checkin:{cust}:{class}` | 1/aula/aluno |
| `perfect_week` | 300/280/220 | classes ≥ threshold/semana | cron Sun 23:59 | `perfect_week:{cust}:{week}` | 1/semana |
| `full_plan_completion` | 600/700 (P8/P12) | aulas atingidas | poll | `fullplan:{cust}:{period}:{planId}` | 1/mês/plano |
| `p8_milestone` | 200/300 | 4 ou 6 aulas no mês (P8) | poll | `milestone:{cust}:{period}:p8:{N}` | 1/mês/marco |
| `p12_milestone` | 250/350 | 6 ou 9 aulas no mês (P12) | poll | `milestone:{cust}:{period}:p12:{N}` | 1/mês/marco |
| `livre_milestone` | 200/300/400/500 | 8/12/16/20 aulas (Livre) | poll | `milestone:{cust}:{period}:livre:{N}` | 1/mês/marco |
| `supera_teu_ritmo` | +250 | classesThisWeek > plan.perfectWeek.threshold | poll | `supera:{cust}:{week}` | 1/semana |

### 4.2 Streaks

| Trigger | Pontos | Condição | Source | Idempotency | Activa boost |
|---|---|---|---|---|---|
| `streak_5_activated` | 0 (só activa boost) | consecutiveDays == 5 | replay state | `streak_5:{cust}:{startDate}` | `streak_5` (1.3×) |
| `streak_10_activated` | 0 | consecutiveDays == 10 | replay state | `streak_10:{cust}:{startDate}` | `streak_10` (1.6×) |
| `streak_15_activated` | 0 | consecutiveDays == 15 | replay state | `streak_15:{cust}:{startDate}` | `streak_15` (1.8×) |
| `streak_shield_used` | 0 | 1 dia perdido + shield disponível | replay state | `shield:{cust}:{period}` | n/a — preserva streak |

> [!note] Shield
> 1×/mês, auto-applied por defeito. Aluno pode toggle "save my shield" via bot. Reset dia 1.

### 4.3 Renovação & retenção

| Trigger | Pontos | Condição | Source | Idempotency | Activa boost |
|---|---|---|---|---|---|
| `subscription_renewed` | +350 | `paid_until` avança ≥25d entre snapshots | memberships_poll | `renewal:{cust}:{membershipId}:{newPaidUntil}` | `renovacao` (1.5×, 14d) |
| `comeback` | +250 | volta após ≥21d ausência | poll | `comeback:{cust}:{returnDate}` | — |
| `dunning_detected` | 0 + alerta | `status_text` matches `/falhou\|Pausado.*falhou/i` (transição) | memberships_poll | `dunning:{cust}:{snapshotDate}` | — |
| `low_usage_checkin` | 0 + msg neutra | dayOfMonth≥20 AND classesThisMonth≤3 AND no pause | cron | `lowusage:{cust}:{period}` | — |

> [!warning] D38 removido
> `early_renewal` foi removido — Strike House usa auto-renew. Não existe "renovação antecipada".

### 4.4 Crescimento (referrals)

| Trigger | Pontos | Condição | Source | Idempotency | Activa boost |
|---|---|---|---|---|---|
| `referral_trial_only` | +200 | Amigo faz trial, não converte | manual | `ref_trial:{inviterId}:{referredId}` | — |
| `referral_phase_1` | +800 | Amigo inscreve-se | manual | `ref_p1:{inviterId}:{referredId}` | `embaixador_referral` (1.4×, 14d) |
| `referral_phase_2` | +1200 | Amigo faz 6 check-ins + 1 renovação | check periodically | `ref_p2:{inviterId}:{referredId}` | — |

**Total referral:** 2000 pts. Anti-fraude: ver [[#12 Anti-fraude]].

### 4.5 UGC (Instagram / social) — opt-in obrigatório

| Trigger | Pontos | Condição | Source | Idempotency | Cap | Activa boost |
|---|---|---|---|---|---|---|
| `story_checkin` | +100 | Story com @ <24h após check-in | manychat OR /postei bot | `story_ck:{cust}:{storyHash}` | 1/dia | `ugc_story` (1.3×, 24h) |
| `story_no_class` | +50 | Story com @ sem check-in coupled | manychat OR /postei | `story_nc:{cust}:{storyHash}` | 1/semana | — |
| `repost_official` | +120 | Repost de @strikershouseportugal | manychat | `repost:{cust}:{postHash}` | 1/semana | — |
| `feed_post` | +180 | Post no feed com @ tag | manychat OR /postei | `post:{cust}:{postHash}` | 1/semana | `ugc_post` (1.4×, 48h) |
| `reel` | +250 | Reel com @ tag | manychat OR /postei | `reel:{cust}:{postHash}` | 1/mês | `ugc_reel` (1.5×, 72h) |

> [!important] Lawful basis
> Todo UGC requer `consentUgc === true` no [[StrikeLab-v3.2-final#10.1 Lawful basis|opt-in]]. Sem isso, qualquer evento UGC é rejeitado silenciosamente.

### 4.6 Desafios semanais

| Trigger | Pontos | Mecânica | winners_max |
|---|---|---|---|
| `weekly_challenge_won` (flash_checkin) | +250 | Primeiros N a check-in em 24h | 5 |
| `weekly_challenge_won` (story_theme) | +250 | Story com tema do dia | 5 |
| `weekly_challenge_won` (aula_lotada) | +200 | Quem enche último lugar | 1 |
| `weekly_challenge_won` (combo_surpresa) | +250 | Combo anunciado em aula, report via bot | ilimitado |
| `weekly_challenge_won` (hora_h) | +200 | Aula nomeada — quem aparece | ilimitado |

Source: cron Mon 06:00 query sobre eventos da janela. Idempotency: `challenge:{challengeId}:{customerId}`.

### 4.7 Música & Comunidade

> [!info] Filosofia
> Escolher música da aula é um ato de **contribuição à comunidade** — toca para a turma inteira, sinaliza pertença sem ser cringe. Valor baixo por acção; reconhecimento via categoria mensal dedicada.

| Trigger | Pontos | Condição | Source | Idempotency | Cap |
|---|---|---|---|---|---|
| `music_choice_accepted` | +50 | `WaSongRequest.status === "active"` (música aceite na playlist da aula) | bot_command | `music:{customerId}:{trackId}:{classId}` | 2/semana |

Estados que **NÃO** creditam:
- `rejected_genre` — bloqueada por blocklist de género
- `rejected_artist` — bloqueada por blocklist de artista
- `rejected_window` — fora da janela de submissão
- `cancelled_by_unbook` — aluno cancelou inscrição na aula
- `swapped` — música substituída (a nova substituição não credita extra; já ganhou pela original)

> [!note] Já integrado
> Integração Spotify existe (`src/lib/spotify/*`), models `WaSongRequest`/`WaClassPlaylist` na schema, handler `song-request.ts` no bot. Implementação Phase 1 = wire `music_choice_accepted` event ao success path do song-request handler.

Reconhecimento longo-prazo: categoria mensal **🎵 Curador do Mês** — ver [[#8.3 Categorias (5)]].

### 4.8 Sistema (admin/operacional)

| Trigger | Pontos | Quem dispara | Idempotency |
|---|---|---|---|
| `manual_adjustment` | livre (±) | admin UI com reason ≥5 chars | `manual:{cust}:{timestamp}` |
| `tier_change_proposed` | 0 | replay state @ nightly | `tier_propose:{cust}:{newTier}` |
| `tier_change_confirmed` | 0 | admin tap | `tier_confirm:{cust}:{newTier}` |
| `monthly_reset_started` | 0 | cron dia 1 02:00 | `reset_start:{period}` |
| `monthly_reset_applied_batch` | 0 | cron batches | `reset_batch:{period}:{batchN}` |
| `monthly_reset_completed` | 0 | cron final | `reset_done:{period}` |
| `pause_set` / `pause_cleared` | 0 | admin UI | `pause:{cust}:{kind}:{timestamp}` |
| `erasure_applied` | 0 | admin UI | `erasure:{cust}:{timestamp}` |
| `consent_changed` | 0 | bot ou admin | `consent:{cust}:{timestamp}` |

---

## 5 Boosts — tabela completa

> [!important] PATCH P4 — boost scope rule
> Boosts aplicam-se **APENAS** a `checkin_observed`. **Não** a one-shots (milestones, perfect_week, full_plan, renewal, referrals, supera_teu_ritmo, weekly_challenges, manual_adjustment).

| Boost ID | Multiplier | Trigger | Duração | Cumulative | Notas |
|---|---|---|---|---|---|
| `weekend` | 1.8× | day ∈ {Sat, Sun} | 48h cíclico | yes | Predicate, não stored row |
| `renovacao` | 1.5× | `subscription_renewed` | 14 dias | yes | Único boost ligado a renovação |
| `streak_5` | 1.3× | streak ≥5 dias | até quebrar | yes | Replace de `streak_5`/`_10`/`_15` (não cumulativo entre si) |
| `streak_10` | 1.6× | streak ≥10 dias | até quebrar | replaces `streak_5` | |
| `streak_15` | 1.8× | streak ≥15 dias | até quebrar | replaces `streak_10` | |
| `ugc_story` | 1.3× | `story_checkin` posted | 24h | yes | |
| `ugc_post` | 1.4× | `feed_post` posted | 48h | yes | |
| `ugc_reel` | 1.5× | `reel` posted | 72h | yes | |
| `supera_ritmo` | 1.2× | `supera_teu_ritmo` | fim da semana | yes | |
| `embaixador_referral` | 1.4× | `referral_phase_1` | 14 dias | yes | |

### 5.1 Boosts removidos definitivamente

> [!fail] Não existem
> - `atleta` (Livre x1.4) — favorecia plano mais caro estruturalmente
> - `embaixador_ratio` (stories>checkins) — incentivava postar em vez de treinar
> - `mini_random` (60-140pts aleatório) — selecção opaca

---

## 6 Formula de stacking

```
finalMultiplier = min(1.0 + Σ(boost_i.multiplier - 1.0), 3.0)
```

**Cap absoluto: 3.0×**

### 6.1 Worked example — P8 weekend renewal + streak 10

```
Cenário: sábado, semana de renovação, streak 10 dias activa.
Aluno faz 2 aulas P8 nesse fim-de-semana, atinge perfect week + full plan.

Pontos base (boosted):
  2 × 110 (checkin)                          = 220 base

Boost stack para checkin:
  weekend (1.8)    → delta 0.8
  renovacao (1.5)  → delta 0.5
  streak_10 (1.6)  → delta 0.6
  Σ deltas         = 1.9
  multiplier       = min(1.0 + 1.9, 3.0) = 2.9 (sob o cap)

  Checkin boosted  = 220 × 2.9 = 638

One-shots (NÃO boosted — PATCH P4):
  Perfect Week P8                            = +300
  Full Plan bonus                            = +600
  Renovação trigger                          = +350

Total nesse fim-de-semana:                   1,888 pts
```

> [!warning] Sem o PATCH P4
> O mesmo cenário daria 220×2.9 + (300+600+350)×2.9 = 638 + 3,625 = **4,263 pts** — economicamente insustentável.

### 6.2 Worst-case theoretical

Máximo possível em uma única aula:
- weekend (1.8) + streak_15 (1.8) + ugc_reel (1.5) + renovacao (1.5) + ugc_post (1.4) + embaixador_referral (1.4)
- Σ deltas: 0.8 + 0.8 + 0.5 + 0.5 + 0.4 + 0.4 = **3.4** → capped a **3.0**
- 1 aula P8 boostada: 110 × 3.0 = **330 pts** (numa única aula)

Realisticamente impossível ter todos estes activos ao mesmo tempo, mas o cap garante teto.

---

## 7 Gates de credit

> [!important] Antes de creditar QUALQUER pontoDelta > 0, todos estes gates têm que passar:

| # | Gate | Implementação | Falhar = |
|---|---|---|---|
| G1 | Identity existe e não está erased | `findByCustomerId(id) && !id.erasedAt` | skip silently |
| G2 | Aluno opted-in para training | `identity.consentTraining === true` | skip silently |
| G3 | Não está em pausa | `medicalPauseUntil`, `vacationPauseUntil`, `personalPauseUntil` all null OR past | skip silently |
| G4 | Membership classifica como "active" (PATCH P14) | `classify(pickBestMembership(memberships)) === "active"` | skip, **emit checkin_observed com pointsDelta=0 para audit** |
| G5 | Não é aggregator/USC (PATCH B4) | `!isNonActionableLead(customer)` | skip silently |
| G6 | UGC trigger requer consentUgc separado | `identity.consentUgc === true` | rejeita evento UGC |
| G7 | Real-name display requer consent separado | `identity.consentRealName === true` | usar pseudónimo no ranking |

### 7.1 classify() — função canónica (skill: yogo-booking-api)

Retorna um dos 7 estados:
- `paused` — `/^Paus/i.test(status_text)` (precedência máxima)
- `ending` — `status === "cancelled_running"` (ainda no período pago)
- `cancelled_ended` — `status === "ended"` AND `ended_because === "cancelled"`
- `failed` — `status === "ended"` AND `ended_because === "payment_failed"`
- `expired` — `status === "ended"` (outras causas)
- `risk` — active mas `paid_until - hoje ≤ 7d` AND `!next_payment.date >= today`
- `active` — **único estado que permite credit**

Spike 2 caso real validado: user_id 1174940 (`status: active`, `status_text: "Pausado. Renovação automática falhou 4 vezes"`) → classify retorna `paused` → **NÃO** recebe pontos.

---

## 8 Prémios mensais

### 8.1 Thresholds iniciais

| Tier | Pontos | Prémio | Custo Strike House | Custo real |
|---|---|---|---|---|
| Bronze | 2,500 | Bandana / pulseira / merch | €8 | €8 |
| Silver | 5,000 | T-shirt Strike House | €25 | €25 |
| Gold | 8,500 | Casaco Strike House | €40 | €40 |
| Diamond | 12,000 | 25% desconto próximo mês | varia | ~€12-19 (25% de €50-75) |

### 8.2 Auto-tuning (D36)

```
SE custo_mensal > 6% MRR → thresholds × 1.10 no mês seguinte
SE custo_mensal < 5% MRR durante 3 meses consecutivos → freeze thresholds
```

Bot expõe `/limiares` para qualquer aluno consultar thresholds do próximo mês.

### 8.3 Categorias (6)

1. 🏆 Mais Aulas
2. 📸 Maior Embaixador (UGC + checkins coupled — não raw story count)
3. 🤝 Mais Trazedor (referrals concluídos)
4. 🔥 Maior Streak
5. 🎵 **Curador do Mês** — mais `music_choice_accepted` aceites no mês (community contribution)
6. 🥊 Mais Cross-trainer — **diferido V2** (precisa Yogo modality mapping)

Cada categoria tem o seu Top 3. Pode haver alunos no Top 3 de várias categorias.

---

## 9 Liga dos Campeões

> [!success] PATCH P10 — sem exclusão
> Top 3 ganham prémio normal **E** badge "Liga dos Campeões" para o mês seguinte. NÃO saem do leaderboard.

Mecânica:
1. Mês N: Top 3 de cada categoria ganham prémio (Bronze/Silver/Gold/Diamond consoante pontos) + badge "Liga dos Campeões" para mês N+1.
2. Mês N+1: badge holders competem **simultaneamente** em:
   - Leaderboard regular (normal — podem voltar a ganhar prémio normal)
   - Leaderboard paralelo "Liga dos Campeões" (só badge holders)
3. Prémio paralelo: voucher masterclass (~€10 valor) + badge "Mentor".
4. Badge expira fim de N+1. Re-entram em N+2 se ganharem categoria de novo.

---

## 10 Patentes vitalícias

> [!info] Princípio
> Status é permanente (excepto violação grave). Benefícios económicos são condicionais a `classify === "active"`.

| Patente | Meses cliente | minXP | Tempo realista P8 (~1800 XP/ano) | Tempo P12 (~2500/ano) | Tempo Livre (~3300/ano) |
|---|---|---|---|---|---|
| Iniciante 🥚 | 0-3 | 0 | — | — | — |
| Bronze 🥉 | 3 | 5,000 | ~3 meses | ~2 meses | ~1.5 meses |
| Prata 🥈 | 6 | 15,000 | ~9-12 meses | ~6-8 meses | ~4-5 meses |
| Ouro 🥇 | 12 | 40,000 | ~24-30 meses | ~16-20 meses | ~12-15 meses |
| Diamante 💎 | 24 | 80,000 | ~45 meses + rubric | ~32 meses + rubric | ~24 meses + rubric |

> [!note] XP sem boosts
> XP recebe valor BASE de cada acção (sem multiplicador). Boosts inflam ranking do mês, não progressão de patente.

### 10.1 Rubric Diamante (2-of-3, manual)

Avaliado por Ricardo + Marcelo aquando atinge XP+meses thresholds:

1. **Conduct** — sem documented code-of-conduct issues nos últimos 12 meses
2. **Engagement** — contribuição visível à comunidade (ajuda novos, eventos, apoio à academia)
3. **Continuity** — sem gaps de subscrição >3 meses nos últimos 24 meses

Decisão registada em UI com justificação 1-2 frases visível ao aluno mediante pedido. Negada? Re-avalia em 6 meses.

---

## 11 Benefícios condicionais (por patente)

> [!important] Condição
> Todos os benefícios económicos exigem `classify(currentMembership) === "active"`. Patente fica, benefício pausa.

| Patente | Benefício | Delivery mechanism | Implementação |
|---|---|---|---|
| Bronze | 5% bootcamps/workshops | Coupon Yogo gerado na inscrição | Admin UI batch (CSV ou POST) |
| Prata | 5% desconto mensal | Batch Yogo coupons dia 1 (1 botão) | Discount Apply Tool |
| Prata | Masterclass priority | Manual reserve list | Admin UI |
| Prata | Welcome-to-Silver brinde | One-shot POS pickup | Inventory tracker |
| Ouro | 10% desconto mensal | Batch | Discount Apply Tool |
| Ouro | 1 PT session/trimestre | Ticket queue | Admin UI + Marcelo's PT calendar |
| Ouro | Masterclass seat reservado | Manual reserve | Admin UI |
| Diamante | 15% desconto mensal | Batch | Discount Apply Tool |
| Diamante | Sessão privada/mês | Ticket queue | Admin UI |
| Diamante | Wall photo na academia | Signed paper consent flow (Art. 7) | Manual upload + consent_id link |
| ~~Diamante~~ | ~~Free months per year~~ | ~~Sem Yogo coupon-for-month flow~~ | **Diferido V2** |

> [!fail] decisionVote
> Removido em D7. Patente Diamante NÃO inclui voto governance.

---

## 12 Anti-fraude

### 12.1 Referral phased payout

```
phase_1 (signup):     +800 pts (imediato)
phase_2 (validation): +1200 pts
  Condições:
    referred.classesAttended ≥ 6
    AND referred.renewals ≥ 1
    AND não detectado como referral ring
```

### 12.2 Anti-ring detection

| Padrão | Acção |
|---|---|
| Pair A→B AND B→A within 60 days | Admin queue, phase_2 bloqueado até aprovação manual |
| >3 successful referrals per inviter per rolling 90 days | Phase_1 credita, phase_2 requer review |
| Phone OR email overlap com `duplicate_suspect` flag | Admin queue |

### 12.3 Caps de UGC (já listados em [[#4.5]])

| Tipo | Cap |
|---|---|
| story_checkin | 1/dia |
| story_no_class | 1/semana |
| repost_official | 1/semana |
| feed_post | 1/semana |
| reel | 1/mês |

### 12.4 Cap por aula

Boost stack `min(..., 3.0)` garante que 1 aula nunca pode dar mais que 3× `pointsPerClass`. Limite teórico absoluto por aula: P8 → 330 pts (Livre teria 165).

---

## 13 Mensagens pt-PT (por trigger)

| Trigger | Mensagem ao aluno |
|---|---|
| `checkin_observed` | (silent — credita pontos sem msg) |
| `streak_5_activated` | "🔥 5 dias seguidos! Boost x1.3 ativado." |
| `streak_10_activated` | "🎉 10 dias seguidos! Boost x1.6 ativado." |
| `streak_15_activated` | "🏆 15 dias seguidos! Boost máximo x1.8 ativado." |
| `streak_shield_used` | "🛡️ Escudo de sequência usado — a tua streak foi preservada." |
| `perfect_week` | "✅ Semana perfeita! +{N} pts." |
| `full_plan_completion` | "💪 Plano cheio! +{N} pts. Próximo mês começa em zero." |
| `livre_milestone` (20) | "🥋 Atleta do Mês — badge ganho. +500 pts." |
| `supera_teu_ritmo` | "🚀 Bateste o teu ritmo! +250 pts + Boost x1.2 (semana)." |
| `subscription_renewed` | "🎉 Subscrição renovada! +350 pts + Boost Renovação ativado (14 dias)." |
| `comeback` | "👋 Bem-vindo de volta! +250 pts. Bom treino." |
| `dunning_detected` | "Olá [nome], notei que houve um problema com a tua subscrição. Fala com o Marcelo quando puderes." (NÃO mencionar pontos) |
| `low_usage_checkin` | "Olá [nome], queríamos só dar um sinal — estamos por cá quando quiseres voltar." (sem -pts, sem pressão) |
| `referral_phase_1` | "🤝 Amigo inscrito! +800 pts agora. Quando ele fizer 6 aulas + 1 renovação, ganhas +1200 pts." |
| `referral_phase_2` | "🎉 O teu amigo continua connosco! +1200 pts." |
| `story_checkin` | "📸 Obrigado pelo story! +100 pts + Boost x1.3 (24h)." |
| `reel` | "🎬 Reel publicado! +250 pts + Boost x1.5 (72h)." |
| `weekly_challenge_won` | "🏆 Ganhaste o desafio '{name}'! +{N} pts." |
| `tier_change_confirmed` | "🎖️ Patente {newTier} atingida. Os teus benefícios estão activos." |
| `music_choice_accepted` | "🎵 Música aceite! +50 pts. Vai estar na playlist da aula {classDateTime}." |

---

## 14 Cortes definitivos

> [!fail] NÃO existem na v3.2-final

### Penalidades (todas removidas)
- `inactivity_long -50pts` (D1) — health-discriminatory
- `broken_streak -30pts` (D2) — insulto adicional

### Boosts removidos
- `embaixador_ratio` (D3) — perverse incentive
- `atleta` Livre (D4) — favorecia plano caro
- `mini_random` (D5) — selecção opaca

### Triggers removidos
- `multi_class_same_day "variable"` (D6) — exploit indefinido
- `early_renewal` (D38) — auto-renew na Strike House

### Benefícios removidos
- `decisionVote: true` Diamante (D7) — governance indefinida

### Diferidos V2
- `cross_training` trigger (Yogo modality não mapeada)
- `dupla` trigger (requer auto-detection)
- Diamante `freeMonthsPerYear` (sem coupon-for-month flow)
- `store_purchase` (sem loja built)
- 2× weekly challenges (Marcelo não cura 2/sem)

> [!note] Reclassificado 2026-05-28
> `music_choice` foi removido dos diferidos — Spotify integration já existe. Agora é trigger activo Phase 1 (ver [[#4.7 Música & Comunidade]]).

### Substituídos
- "1 mês grátis" prize → 25% desconto próximo mês (D17 — accounting honesto)
- Liga dos Campeões "exílio" → parallel leaderboard (P10)

---

## 15 Reverse lookup — "Como ganho mais X?"

### 15.1 Maximizar Pontos do Mês (curto prazo)

Em ordem de impacto/esforço:

1. **Treinar consistentemente** — base × milestones × perfect week (P8 max: 880 + 200+300+600 + 300 = 2,280 pts só de treino)
2. **Sustentar streak** — 5/10/15 dias activa boosts 1.3/1.6/1.8 nos pontos de check-in
3. **Aproveitar weekends** — boost 1.8 cíclico
4. **Renovação** — +350 + boost 1.5 por 14 dias
5. **Referral conversão** — 800+1200 = 2000 pts (mais alto evento individual)
6. **Reel UGC** — +250 + boost 1.5 por 72h
7. **Desafios semanais** — Flash check-in (+250), Combo (+250)
8. **Comeback** — +250 ao voltar de 21+ dias
9. **Story coupled com check-in** — +100/dia + boost 1.3
10. **Música escolhida da aula** — +50 por aceite, cap 2/sem. Bonus: candidato a "Curador do Mês" 🎵

### 15.2 Maximizar XP (progressão patente — longo prazo)

XP = pontos sem boost. Para subir patente mais rápido:

| Acção | XP/ano típico |
|---|---|
| Treinar 8× P8 todos os meses | 12 × (880 + 200+300+600) = **23,760 XP** |
| Treinar 12× P12 todos os meses | 12 × (960 + 250+350+700) = **27,120 XP** |
| Plano Livre 18×/mês | 12 × (990 + 200+300+400+500) = **28,680 XP** |
| Convidar 1 amigo que converte | 2,000 XP |
| Renovar (auto) 12× | 12 × 350 = 4,200 XP |
| Streaks + perfect weeks | varia, ~5,000-8,000 XP |

Realista P8 disciplinado: **~30,000-35,000 XP/ano** → Prata em 6 meses, Ouro em 16-20 meses.

### 15.3 "Onde NÃO ganho pontos?"

> [!warning] Comportamentos sem reward
> - Inactividade (não há penalty mas também não há reward)
> - Treinar com membership em dunning (gate G4 bloqueia)
> - Stories sem opt-in UGC
> - Convidar amigo que faz só trial e não inscreve (só +200, não +800)
> - Aulas com check-in mas membership pausada
> - Cross-training (V2, ainda não activo)

---

## 16 Retroactive credit (Phase 1 launch)

> [!success] Bola de pré-aquecimento
> Phase 0 corre 2-3 semanas em silêncio. Cada `checkin_observed`, `subscription_renewed`, `comeback` é gravado com `pointsDelta=0`. **Day 1 do Phase 1** faz replay com pontos calculados — alunos arrancam com pontos das últimas semanas creditados automaticamente.

Regras:
- ✅ Elegíveis: `checkin_observed`, `subscription_renewed`, `comeback`
- ❌ Não elegíveis: tier changes, manual adjustments, erasures, consent changes
- ❌ Boosts não se aplicam retroactivamente (apenas pontos base)
- ✅ Streaks SÃO calculadas (state materializa correctly)
- 🛡️ Cap de safety: ≤ 1.5× monthly points cap por aluno

Detalhe técnico completo: [[StrikeLab-v3.2-final#12.1 Retroactive credit no Phase 1 launch]].

## Cross-references — implementação

| Mecânica | Spec | Phase 0 Task | Phase 1 Task |
|---|---|---|---|
| Dual ledger | [[StrikeLab-v3.2-final#3 Ledger duplo]] | Task 2 (schema) | Task — points credit logic |
| classify() gate | [[StrikeLab-v3.2-final#2.4 Gating]] | Task 7 | Task — apply in all triggers |
| Polling 15min + daily | [[StrikeLab-v3.2-final#2.3 Polling Yogo]] | Tasks 8, 9, 10, 11 | — |
| Onboarding 4 toggles | [[StrikeLab-v3.2-final#10.2 Opt-in 4 toggles]] | Task 12 | — |
| Adaptive prizes | [[#8.2 Auto-tuning]] | — | Task (Phase 1) |
| Champions League | [[#9 Liga dos Campeões]] | — | Task (Phase 1) |
| Referral phased | [[#12.1 Referral phased payout]] | — | Task (Phase 2) |
| UGC opt-in | [[#4.5]] | — | Task (Phase 2) |
| Erasure 2-track | [[StrikeLab-v3.2-final#10.4 Erasure]] | Task 13 | — |
| Admin UI 13 ecrãs | [[StrikeLab-v3.2-final#11 Admin UI MVP]] | Tasks 14, 15 (5 base) | Task — 8 remaining |

Ver [[StrikeLab-Cobertura]] para matrix completa.
