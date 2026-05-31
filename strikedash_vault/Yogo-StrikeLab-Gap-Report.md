---
title: Yogo API ↔ StrikeLab v3.2 — Gap Report
type: technical
status: validated against live tenant (3 of 4 spikes executed)
created: 2026-05-28
owner: Ricardo
spike_capture_date: 2026-05-28
---

# Yogo API ↔ StrikeLab v3.2 — Gap Report

> Mapeamento definitivo entre o que o StrikeLab v3.2-final precisa e o que a API Yogo oferece. Validado contra o tenant `strikershouse.yogobooking.pt` em 2026-05-28.

Ver também: [[The Vault]] · [[StrikeLab-v3.2-final]] · [[StrikeLab-Convergence-Report]] · [skill: yogo-booking-api](~/.claude/skills/yogo-booking-api)

## Methodology

- **Spikes 1, 2, 4** capturados via `scripts/strikelab-yogo-spikes.sh` (curl). 149 memberships e 14 aulas analisadas com dados reais.
- **Spike 3** pendente — manual DevTools (não bloqueante; fallback CSV documentado).
- **Regra observada:** zero queries cliente-a-cliente. Todos os endpoints usados são bulk.

## 📊 Tabela OK/Gaps

| # | Necessidade StrikeLab | Endpoint Yogo | Bulk? | Status | Notas |
|---|---|---|---|---|---|
| **Identity** |
| 1 | Listar todos os subscritores activos | `POST /reports/customers` + filter `hasMembershipOrClassPass(ALL_SUB_IDS, true)` | ✅ | **OK** | ~150 rows em 1 query |
| 2 | Lookup cliente por telefone | `findCustomerByPhone()` em cache 60s sobre bulk fetch | ✅ | **OK** | Já implementado em `src/lib/yogo/lookup.ts` |
| 3 | Lookup cliente por email (fallback quando phone é null) | Mesmo bulk fetch, novo índice por email normalizado | ✅ | **GAP** | Necessário: estender `lookup.ts` (Spike 4 revelou phone pode ser null) |
| 4 | Nome do cliente | `first_name`, `last_name` no customer/membership report | ✅ | **OK** | |
| 5 | Email do cliente | `user_email` em `/reports/memberships-list`, `email` em `/users/{id}` | ✅ | **OK** | |
| 6 | Detecção de aggregator/USC (filtrar do gamification) | `isNonActionableLead` recipe (regex no email) | ✅ | **OK** | Já existe — usar nos pollings |
| **Check-in (core trigger)** |
| 7 | Aulas do dia com inscritos + check-in status | `GET /classes?startDate=X&populate[]=signups.user` | ✅ | **OK** | |
| 8 | Timestamp de check-in (ms precision) | `signups[].checked_in` (Unix ms, 0 = não fez) | ✅ | **OK CONFIRMADO** | Spike 1: resolução real a milissegundos. 1779867205779 = 27 Mai 07:33:25Z |
| 9 | Ordenar "primeiros a fazer check-in" (Flash Challenge) | `ORDER BY signups.checked_in ASC LIMIT N` no nosso lado | ✅ | **OK** | Spike 1 confirma 5-21s entre alunos consecutivos — ordem fiável |
| 10 | Capacidade da aula (último lugar — Aula Lotada) | `seats` + `signup_count` populated | ✅ | **OK** | |
| 11 | Tipo de aula (modality V2 cross-training) | `populate[]=class_type` → `class_type.name` | ✅ | **OK (V2)** | Diferido a V2 — gap está em criar mapping table no nosso lado |
| 12 | Filtrar signups cancelados | `cancelled_at !== 0` (signups têm cancelled_at = Unix ms) | ✅ | **OK** | Documentado em schemas.md |
| **Subscrições / Renovações** |
| 13 | Listar memberships com status_text computado | `POST /reports/memberships-list {}` | ✅ | **OK** | 149 rows validadas no Spike 2 |
| 14 | Campos do report (validação) | 20 fields confirmados | ✅ | **OK** | `paid_until`, `status`, `status_text`, `next_payment`, `user_id`, `membership_type_name`, etc. |
| 15 | Detectar renovação | Diff `paid_until` entre snapshots diários | ✅ | **OK (snapshot-diff)** | Não existe `last_renewed_at` no report. Tabela nova: `yogo_membership_snapshot` |
| 16 | Detectar cancelamento explícito | `status === "cancelled_running"` ou `ended + ended_because === "cancelled"` | ✅ | **OK** | |
| 17 | Detectar payment failure (dunning) | Parsing `status_text` regex `/falhou\|Cartão\|Pausado.*falhou/i` | ✅ | **PARTIAL** | Campo `renewal_failed` NÃO está no report (só em `/users/{id}` populated). Spike 2 confirmou via real case: user 1174940 ("Pausado. Renovação automática falhou 4 vezes.") |
| 18 | Detectar pausa | `/^Paus/i.test(status_text)` | ✅ | **OK** | Recipe `classify()` |
| 19 | Determinar plano "real" (multi-membership users) | `pickBestMembership()` recipe (status priority + paid_until tiebreaker) | ✅ | **OK** | Usar em vez de `has_membership_membership_description` |
| 20 | Bloquear pontos a alunos em dunning/pausa | `classify(m) !== "active"` antes de creditar | ✅ | **OK** | Função canónica em recipes.md |
| **Customer profile** |
| 21 | Data de nascimento (auditoria menores RGPD Art. 8) | `date_of_birth` em `/users/{id}` populated | ⚠️ | **GAP OPERACIONAL** | Spike 4: campo existe mas é **opcional** no Yogo. User 1188416 (Natali) tem `date_of_birth: null`. Precisa audit manual de ~150 alunos antes do go-live |
| 22 | NIF do cliente (fiscal) | `vat_id` em `/users/{id}` (NÃO no report) | ⚠️ | **N/A para StrikeLab** | Não usado em gamificação |
| 23 | Customer additional info | `customer_additional_info` em `/users/{id}` | ⚠️ | **N/A para StrikeLab** | |
| **Discount codes (tier benefits delivery)** |
| 24 | Listar discount codes | `GET /discount-codes?populate[]=valid_for_items_text&populate[]=discount_type_text` | ✅ | **OK (read)** | |
| 25 | Criar discount code programaticamente | `POST /discount-codes` (não documentado, suspeitado a partir de batches PTMD1xxx) | ⏳ | **PENDING SPIKE 3** | Manual DevTools necessário. Fallback: CSV-then-paste (ver Phase 0 Task 8) |
| 26 | Delete discount code | `DELETE /discount-codes/{id}` (não documentado) | ⏳ | **PENDING SPIKE 3** | Bonus capture no Spike 3 |
| **Revenue (out of StrikeLab scope)** |
| 27 | Dashboard revenue YTD | `POST /graphql` revenueReport | ✅ | **OK (existing)** | Único endpoint GraphQL. Já em uso no dashboard. Não usado por StrikeLab |
| **Class signups (booking writes — V2 features)** |
| 28 | Bookar aluno em aula via bot | `POST /class-signups {user:"<id>",class:<id>}` | ✅ | **OK (existing)** | Já em uso pelo WA bot |
| 29 | Cancelar signup | `DELETE /class-signups/{id}` → text "OK" | ✅ | **OK (existing)** | Já em uso |

## 🚨 Achados críticos dos spikes

### Spike 1 — Check-in timestamps (confirmação completa)

**Sample real captured (2026-05-27 morning class 2421626):**
```json
{
  "user_id": 1188415, "checked_in": 1779867200641,   // 07:33:20
  "user_id": 1188416, "checked_in": 1779867205779    // 07:33:25 (5s depois)
}
```

**Implicação:** Flash Check-in winners pode usar `MIN(checked_in)` por aluno na janela do desafio. Resolução ms permite tie-breaking justo até 5s de diferença.

### Spike 2 — Dunning silencioso confirmado (caso real)

**user_id 1174940** está actualmente:
```json
{
  "status": "active",                                              // 👈 mentira
  "status_text": "Pausado. Renovação automática falhou 4 vezes.",  // 👈 verdade
  "paid_until": "2026-03-31",                                      // 👈 expirou há ~2 meses
  "next_payment": { "date": "2026-04-01", "amount": 40 }
}
```

**Implicação CRÍTICA:** Sem `classify()`:
- Esta pessoa apareceria como "active subscriber" no leaderboard
- Receberia pontos por aulas que tecnicamente não está a pagar
- Crédito de prémio físico seria perda financeira directa

**Patch P14 forçado**: todo o credit de pontos passa por `classify(membership) === "active"`. Adicionado às tarefas Phase 0.

### Spike 4 — DOB opcional + Phone pode ser null

**user_id 1188416 (Natali da Silva Gomes Leite)**:
- `date_of_birth: null` (não preenchido)
- `phone: null` (não preenchido!)
- `email: present`
- 0 memberships activas (trial/lead)

**Implicações:**
1. **Audit de menores não é automático.** Marcelo precisa de garantir DOB preenchido para todos os subscritores activos antes do go-live (~30 min de trabalho no Yogo admin).
2. **Identity resolution não pode depender só de phone.** Adicionar lookup por email normalizado.
3. **Bot onboarding deve recusar opt-in** se DOB não estiver no Yogo: "Para participares preciso primeiro confirmar a tua idade — fala com o Marcelo."

## 🔧 Patches a aplicar à spec v3.2-final

Resultantes da skill reading + spike findings:

| # | Patch | Origem |
|---|---|---|
| B1 | Trigger `dunning_detected` quando `/falhou\|Pausado.*falhou/i.test(status_text)` muda false→true | Skill (recipes.md) + Spike 2 |
| B2 | Função canónica `classify()` para determinar estado real (paused, ending, cancelled_ended, failed, expired, risk, active) | Skill (recipes.md) |
| B3 | Função `pickBestMembership()` para users com múltiplas memberships | Skill (recipes.md) |
| B4 | Filtro `isNonActionableLead` em todas as queries de gamificação | Skill (recipes.md) |
| P14 | **Bloqueio em dunning**: nenhum pointsDelta > 0 se `classify(m) !== "active"` | Spike 2 (caso real user 1174940) |
| P15 | **DOB enforcement**: bot recusa onboarding até Marcelo confirmar DOB no Yogo | Spike 4 (Natali sem DOB) |
| P16 | **Email como segundo eixo de identity resolution** | Spike 4 (Natali sem phone) |
| P17 | **Detector de dunning real-time** com mensagem empática + alerta Marcelo | Spike 2 |

## ⏳ Spike 3 — ainda pendente

Manual em DevTools. Instruções em [[yogo-spikes/SPIKE-3-MANUAL|SPIKE-3-MANUAL]].

**Sem este spike:** O "Discount Apply Tool" do StrikeLab Phase 1 arranca em modo CSV:
- Marcelo clica "Generate Coupons" no admin StrikeLab
- Sistema produz CSV com `{user_id, plano, percentage, code_suggestion}`
- Marcelo cola no Yogo admin UI manualmente (~30 min/mês)

**Com o Spike 3 desbloqueado:** Tool gera coupons via API e Marcelo só revê/aprova.

Não é bloqueador para Phase 0. Sugiro fazer antes de Phase 1 começar.

## 📌 Constantes que precisam de cross-check

Skill avisa: plan IDs podem mudar quando estúdio recria planos. Antes de Phase 1 arrancar, validar via:

```bash
curl "$YOGO_BASE/membership-types?populate[]=membershipCount" $H \
  | jq '[.[] | select(.archived==0 and .membershipCount>0) | {id, name, count: .membershipCount}]'
```

Verificado (Spike 2 fields, indirect):
- `8 sessões/mês` (vários user_ids confirmaram este nome)
- `24 sessões/mês`
- Plus os documentados no skill (6021, 6020, 6107, 6153, 6178, 6294, 6520)

## ✅ Conclusão

**Phase 0 não está bloqueada por nenhum gap.**

- Os 3 spikes executados confirmaram que a arquitectura proposta funciona
- O 4º spike (DOB) revelou um gap operacional que se resolve com audit manual antes do go-live
- O Spike 3 (coupon POST) é nice-to-have — fallback CSV é aceitável

**Próximo:** ler [[StrikeLab-v3.2-final]] (spec consolidada com patches B1-B4 + P1-P17) e [[StrikeLab-Phase-0-Plan-Final]].
