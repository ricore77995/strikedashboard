---
title: StrikeLab Phase 2 — Referral System Design
type: design
status: spec-approved-post-adversarial
created: 2026-06-02
updated: 2026-06-03
owner: Ricardo
slices: 4 (R1a → R1b → R2 → R3)
related:
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Pontuacao-Mapa]]"
  - "[[StrikeLab-Phase-1-Engine-Handoff]]"
  - "[[StrikeLab-Sprint-8-Handoff]]"
---

# StrikeLab Phase 2 — Referral System Design

> Spec para o sistema de indicações. Alunos partilham um código, o indicador recebe pontos em 3 tiers: trial (+200), subscrição (+800), retenção (+1200 após 6 check-ins + 1 renovação).
>
> **Actualizado 2026-06-03:** Pós adversarial review — 2 FATAL + 4 MAJOR corrigidos inline.

Ver também: [[StrikeLab-v3.2-final]] · [[StrikeLab-Pontuacao-Mapa]] · [[StrikeLab-Phase-1-Engine-Handoff]]

## 1. Data Model

### 1.1 Novo model: Referral

```prisma
model Referral {
  id                  String   @id @default(cuid())
  inviterCustomerId   Int
  referredCustomerId  Int      @unique
  referralCodeUsed    String
  status              String   @default("pending")
  linkedAt            DateTime @default(now())  // timestamp when referral was linked — used for temporal scoping
  createdAt           DateTime @default(now())
  trialCreditedAt     DateTime?
  phase1CreditedAt    DateTime?
  phase2CreditedAt    DateTime?

  inviter  GamificationIdentity @relation("ReferralsMade", fields: [inviterCustomerId], references: [customerId])
  referred GamificationIdentity @relation("ReferralReceived", fields: [referredCustomerId], references: [customerId])

  @@index([inviterCustomerId])
  @@index([status])
}
```

### 1.2 Campo novo em GamificationIdentity

```prisma
referralCode String? @unique
```

### 1.3 Event types novos (em types.ts)

```ts
| "referral_trial_only"
| "referral_phase_1"
| "referral_phase_2"
```

Nenhum change no schema do `GamificationEventLog` — os tipos são strings na coluna `eventType`.

### 1.4 Labels novas (em labels.ts)

```ts
referral_trial_only: "Indicação — Trial",
referral_phase_1: "Indicação — Subscrição",
referral_phase_2: "Indicação — Retenção",
// BOOST_LABELS:
embaixador_referral: "Embaixador",
```

### 1.5 State machine

```
pending         → Referral row criado (código introduzido, identidade ligada)
trial_credited  → Primeiro check-in observado após linkedAt → +200 ao indicador
phase1_credited → Subscrição detectada após linkedAt → +800 ao indicador, embaixador boost activado (14d)
phase2_credited → 6 check-ins + 1 renovação ambos após linkedAt → +1200 ao indicador
```

Transições permitidas:
- `pending` → `trial_credited` (pollClasses detecta check-in)
- `pending` → `phase1_credited` (pollMemberships detecta subscrição, sem trial prévio — subscreveu directo)
- `trial_credited` → `phase1_credited` (pollMemberships detecta subscrição)
- `phase1_credited` → `phase2_credited` (ambos os triggers podem activar)

> **Invariant:** Cada transição de estado usa conditional WHERE: `update({ where: { id, status: "<expected>" } })`. Se 0 rows affected → outro poll já processou → skip. Isto previne TOCTOU race conditions entre pollClasses e pollMemberships.

## 2. Referral Code Generation

- **Formato:** 6 caracteres alfanuméricos, uppercase, excluídos `0/O/1/I/l` (ambíguos)
- **Alfabeto:** `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (28 chars)
- **Espaço:** 28^6 ≈ 481M combinações
- **Geração:** no `upsertIdentity()` create path
- **Colisão:** retry once on P2002 (unique constraint). Duas colisões seguidas → throw (praticamente impossível a <500 alunos)
- **Identidades existentes:** código gerado on-demand (admin "Generate code" ou via migration script)

## 3. Logic & Credit Flow

### 3.1 Gates obrigatórios (POST-ADVERSARIAL FIX)

> **Regra:** Antes de creditar qualquer referral points ao indicador, verificar:
> 1. `checkCreditGates(inviterCustomerId)` — indicador deve estar opted-in, active, not erased, not paused
> 2. O referido deve ter `consentTraining === true` — sem consentimento do referido, não creditamos o indicador
>
> Sem ambos os gates → skip silencioso (não emitir evento, não avançar estado).

### 3.2 Temporal scoping (POST-ADVERSARIAL FIX)

> **Regra:** Phase 2 condição "6 check-ins + 1 renovação" conta APENAS eventos:
> - `checkin_observed` com `createdAt >= referral.linkedAt`
> - `subscription_renewed` com `createdAt >= referral.linkedAt`
>
> Isto previne que alunos existentes com 40+ check-ins recebam phase 2 instantaneamente.
> O campo `linkedAt` no Referral model é a referência temporal.

### 3.3 Novo ficheiro: `src/lib/gamification/referral.ts`

#### `linkReferral(code: string, referredCustomerId: number)`

1. Lookup `referralCode` → encontrar `inviterCustomerId`
2. Anti-ring checks:
   - `inviterCustomerId !== referredCustomerId` (sem auto-referral)
   - Não existe `Referral` onde `referredCustomerId` = este aluno (um indicador por referido)
3. Criar `Referral` com `status: "pending"`, `linkedAt: now()`
4. Error handling: P2002 em `referredCustomerId` → retornar `{ ok: false, reason: "already_referred" }`
5. Não emitir eventos neste passo — os poll hooks detectam as condições

#### `tryReferralTrial(referredCustomerId: number)`

- Chamado de `pollClasses()` após check-in creditado
- Lookup `Referral` onde `referredCustomerId` e `status: "pending"`
- Verificar gates (§3.1)
- Verificar que o check-in actual é posterior a `linkedAt`
- Emit `referral_trial_only` +200 ao indicador
- Status update com conditional WHERE: `update({ where: { id, status: "pending" }, data: { status: "trial_credited", trialCreditedAt: now() } })`
- Se 0 affected → skip (outro poll processou)
- Idempotency: `ref_trial:{inviterId}:{referredId}`

#### `tryReferralPhase1(referredCustomerId: number)`

- Chamado de `pollMemberships()` quando subscrição detectada
- Lookup `Referral` onde `referredCustomerId` e `status` in (`pending`, `trial_credited`)
- Verificar gates (§3.1)
- Se `status === "pending"` → creditar trial primeiro (emit trial event, advance status), depois phase 1
- Emit `referral_phase_1` +800 ao indicador
- Status update com conditional WHERE
- Idempotency: `ref_p1:{inviterId}:{referredId}`

#### `tryReferralPhase2(referredCustomerId: number)`

- Chamado de ambos `pollClasses()` e `pollMemberships()`
- Lookup `Referral` onde `referredCustomerId` e `status: "phase1_credited"`
- Verificar gates (§3.1)
- **Temporal scoping (§3.2):**
  - Contar `checkin_observed` events do referido com `createdAt >= referral.linkedAt` → ≥ 6
  - Verificar `subscription_renewed` event do referido com `createdAt >= referral.linkedAt` existe
- Ambos → emit `referral_phase_2` +1200 ao indicador
- Status update com conditional WHERE
- Idempotency: `ref_p2:{inviterId}:{referredId}`

### 3.4 Anti-ring (minimum viable)

| Regra | Implementação |
|---|---|
| Sem auto-referral | `inviterCustomerId !== referredCustomerId` |
| Um indicador por referido | `referredCustomerId @unique` no Referral |
| Padrões suspeitos | Flag no admin UI (mesmo prefixo telemóvel, mesmos criados no mesmo dia) — sem auto-block |

## 4. Poll Hook Wiring

### 4.1 `poll/classes.ts`

Após o bloco de post-checkin hooks existente:

```ts
await tryReferralTrial(customerId);
await tryReferralPhase2(customerId);
```

### 4.2 `poll/memberships.ts`

Após emissão do evento `subscription_renewed`:

```ts
await tryReferralPhase1(row.user_id);
await tryReferralPhase2(row.user_id);
```

**Ambos os triggers chamam `tryReferralPhase2()`** porque qualquer condição (check-ins ou renovação) pode ser a última peça. A idempotency key + conditional WHERE previne duplo crédito.

## 5. Boost Integration

### 5.1 `boosts.ts` — embaixador_referral

Novo bloco em `getActiveBoostsForCheckin()`, usando `findFirst` (NÃO `findMany`) — mirror do padrão `renovacao`:

```ts
// Embaixador referral boost: referral_phase_1 event within last 14 days
const recentReferralPhase1 = await db.gamificationEventLog.findFirst({
  where: {
    customerId,
    eventType: "referral_phase_1",
    createdAt: { gte: fourteenDaysAgo },
  },
});
if (recentReferralPhase1) {
  boosts.push({ id: "embaixador_referral", multiplier: 1.4 });
}
```

> **Invariant:** Usar `findFirst`, nunca `findMany`. O boost é booleano — ou tens ou não tens. O número de referrals não stacked o multiplicador.

**Scope rule (PATCH P4):** Boost aplica-se APENAS a `checkin_observed`. Os one-shots de referral são flat.

## 6. Admin API (Slice R1b — moved from R2)

### 6.1 `POST /api/strikelab/admin/referrals/link`

- Body: `{ inviterCustomerId, referredCustomerId }`
- Chama `linkReferral()` com a mesma lógica
- Permite admin linkar referrals retroactivos (para early adopters)
- `linkedAt` pode ser overridden para datas passadas (admin discretion)

> **Razão para mover para R1b:** Early adopters que já trouxeram amigos precisam de poder ser compensados. Sem isto, o sistema lança sem utilidade para a comunidade existente.

## 7. Student & Admin UI (Slice R2)

### 7.1 Student API (`/api/strikelab/me`)

Retorna `referralCode` da identity (já carregada).

### 7.2 Student UI (`me-client.tsx`)

Novo card:
- Código 6-char em texto monospace grande
- Botão "Partilhar código" → clipboard com texto "Usa o meu código {CODE} na Strike House! 💪"
- Contador "Amigos trazidos: X" (count de Referral onde `inviterCustomerId`)

### 7.3 Admin API (`/api/strikelab/admin/referrals`)

- **GET:** lista referrals com nome do indicador, nome do referido, status, pontos creditados, datas

### 7.4 Admin Page (`/dashboard/strikelab/referrals`)

- Tabela com status pill colorido: amber=pending, blue=trial, emerald=phase1, gold=phase2
- Filtro por status
- Click na row → detalhe do aluno

## 8. WhatsApp Bot (Slice R3)

### 8.1 Fluxo no onboarding (`strikelab-onboard.ts`)

Após confirmação de consent, antes do magic link:

1. Bot pergunta: "Tens um código de indicação de um amigo? Responde com o código ou escreve não."
2. Código válido → `linkReferral(code, customerId)`
3. Código inválido → "Código não encontrado. Sem problema, podes continuar!"
4. "Não" ou sem resposta → skip

**Sem staging pré-identidade necessário** — o fluxo de onboarding cria a identity antes deste passo.

## 9. Slices

| Slice | Ficheiros | LOC est. | Verify |
|---|---|---|---|
| R1a | types.ts, labels.ts, schema.prisma | ~40 | migrate + tsc + tests green |
| R1b | referral.ts (new), identity.ts, boosts.ts, poll/classes.ts, poll/memberships.ts, admin/referrals/link (new) | ~150 | unit: code gen, integration: link+credit+gates, boost active |
| R2 | me/route.ts, me-client.tsx, admin/referrals (GET), dashboard/referrals (new) | ~100 | student vê código, admin vê tabela, share copia clipboard |
| R3 | strikelab-onboard.ts | ~60 | bot pergunta código, link criado |

## 10. Adversarial Review Fixes (2026-06-03)

| # | Severity | Finding | Fix applied |
|---|---|---|---|
| 1 | 🔴 FATAL | Phase 2 sem temporal scoping — contava TODOS os check-ins históricos | §1.1: campo `linkedAt`. §3.2: queries filtram `createdAt >= linkedAt` |
| 2 | 🔴 FATAL | Race condition em status update (TOCTOU entre polls) | §1.5: conditional WHERE em todas as transições de estado |
| 3 | 🟡 MAJOR | Referral credits bypassam checkCreditGates | §3.1: gates obrigatórios no inviter (opted-in, active, not erased) + consent no referido |
| 4 | 🟡 MAJOR | embaixador boost stacked por referral | §5.1: `findFirst` (não `findMany`), boost é booleano |
| 5 | 🟡 MAJOR | Referral fire sem consentimento do referido | §3.1: referred deve ter `consentTraining === true` |
| 6 | 🟡 MAJOR | Admin manual link só em R2 | §6: movido para R1b |
| 7 | 🔵 MINOR | appendEvent eventId não concurrency-safe | Tech debt existente, não referral-specific |
| 8 | 🔵 MINOR | referredCustomerId @unique impede re-engagement | Override path em admin para terminal+90d |
| 9 | 🔵 MINOR | Point economy calibration (2200 = ~2 meses P8) | Monitorar via D36 auto-tuning |

## 11. Riscos remanescentes

| Risco | Mitigação |
|---|---|
| Phase 2 dual-condition ordering | Renovação pode vir antes de 6 check-ins. Ambos os triggers verificam ambas as condições com temporal scoping. |
| appendEvent eventId race | Tech debt pré-existente. Referral não agrava. Futuro: autoincrement. |
| Re-engagement blocked por unique | Admin override path para terminal+90d. |
