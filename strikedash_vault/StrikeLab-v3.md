---
title: StrikeLab v3.0 — Spec de Gamificação
type: design
status: draft (em refinamento adversarial)
created: 2026-05-27
owner: Ricardo
---

# StrikeLab v3.0 — Sistema de Gamificação

> Sistema de gamificação dual-ledger (Pontos do Mês + XP Lifetime) com patentes vitalícias, calibrado economicamente para CAC/LTV reais.

Ver também: [[The Vault]] · [[Yogo-API]] · [[WhatsApp-Bot-Design]]

## Resumo

- **Dual ledger:** Pontos do Mês (consumíveis, zeram dia 1) + XP Lifetime (permanente, define patente).
- **3 planos calibrados:** P8 (60pts/aula), P12 (45pts/aula), Livre (35pts/aula + milestones).
- **Triggers permanentes:** renewal, streak, activity, growth, social/UGC, penalties.
- **Boosts com stacking cap 3.0x.**
- **Mystery weekly challenges:** 2x/semana, Liga dos Campeões rotation.
- **5 patentes:** Iniciante → Bronze → Prata → Ouro → Diamante (validação manual).

## Spec JSON Completa

```json
{
  "system": "StrikeLab",
  "version": "3.0",
  "lastUpdated": "2026-05-27",
  "owner": "Strike House Portugal",
  "_description": "Sistema de gamificação dual-ledger (Pontos do Mês + XP Lifetime) com patentes vitalícias, calibrado economicamente para CAC/LTV reais.",

  "ledgers": {
    "monthlyPoints": {
      "purpose": "Competição, ranking mensal, resgate de prémios físicos",
      "behavior": "Zera no dia 1 de cada mês",
      "consumable": true
    },
    "lifetimeXP": {
      "purpose": "Determina patente permanente do aluno",
      "behavior": "Acumula para sempre, nunca decresce",
      "consumable": false,
      "note": "Toda ação que credita Pontos do Mês credita simultaneamente XP (mesmo valor base, sem aplicação de boosts)"
    }
  },

  "plans": {
    "plano_8":     { "label": "8 aulas",  "price_eur": 50, "pointsPerClass": 60, "fullPlanBonus": 800, "perfectWeek": { "threshold_classesPerWeek": 2, "bonus": 350 } },
    "plano_12":    { "label": "12 aulas", "price_eur": 60, "pointsPerClass": 45, "fullPlanBonus": 700, "perfectWeek": { "threshold_classesPerWeek": 3, "bonus": 280 } },
    "plano_livre": {
      "label": "Livre", "price_eur": 75, "pointsPerClass": 35, "fullPlanBonus": null,
      "_note": "Plano Livre não tem 'teto' de plano. Usa milestones progressivos.",
      "perfectWeek": { "threshold_classesPerWeek": 4, "bonus": 220 },
      "milestones": [
        { "classesInMonth": 8,  "bonus": 200, "extra": null },
        { "classesInMonth": 12, "bonus": 300, "extra": "activate_boost_atleta" },
        { "classesInMonth": 16, "bonus": 400, "extra": null },
        { "classesInMonth": 20, "bonus": 500, "extra": "badge_atleta_do_mes" }
      ]
    }
  }
}
```

> Spec completa preservada em `strikedash_vault/StrikeLab-v3-full.json` para referência machine-readable.

## Feedback Inicial (Claude)

### Strengths

- Dual-ledger separa competição de progressão — padrão moderno (Duolingo, Strava).
- Calibração económica com CAC/LTV real — à frente de 95% dos sistemas de loyalty.
- Streak Shield evita "perdi 8 dias, desisto".
- Referral em duas fases (1000 + 1500) — anti-fraude correcta.
- Patente vitalícia + benefício condicional — preserva status, condiciona valor.
- Cap de stacking 3.0x trava whale dynamics.
- Liga dos Campeões rotation previne dominação Top 3.
- Plano Livre com milestones (sem "100% completo") — adaptação correcta.

### Riscos críticos

1. **Identity resolution** (IG ↔ WhatsApp ↔ Yogo `customer_id`) não está resolvida.
2. **Yogo não tem webhook de check-in** — latência de streak/triggers depende de polling.
3. **ManyChat IG detection é frágil** — stories privadas, expiry, false negatives.
4. **Tier benefits delivery** ao Yogo não tem mecanismo definido.

### Riscos importantes

5. Penalty -50pts por inactividade pode causar loss aversion.
6. "Embaixador Ratio UGC" cria incentivo para spam de stories.
7. Random Mini Boost precisa critério de selecção definido.
8. "Dupla" depende de ambos reportarem — atrito alto.

### Operacionais por definir

9. Admin UI (ranking, override, validação manual).
10. GDPR / consentimento PII.
11. Monthly reset idempotência.
12. Storage growth (event log TTL ou agregação).
13. Cross-training requer Yogo expor `class_type`/modality.

## Próximo passo

→ Refinamento adversarial via `autoresearch:reason`. Resultados serão sintetizados num plano de implementação faseado.
