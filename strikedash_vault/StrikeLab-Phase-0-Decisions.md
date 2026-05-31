---
title: StrikeLab Phase 0 — Decisions Log
type: design
status: open — Ricardo to resolve
created: 2026-05-29
owner: Ricardo
tags:
  - strikelab
  - decisions
  - phase-0
related:
  - "[[StrikeLab-v3.2-final]]"
  - "[[StrikeLab-Cobertura]]"
---

# StrikeLab Phase 0 — Decisions Log

> Decisões necessárias antes / durante Phase 0. Cada uma com data de resolução + 1 linha de contexto.

## Decision Gates

| # | Gate | Decisão | Data | Notas |
|---|---|---|---|---|
| DG-1 | Vercel Pro upgrade (~€20/mês) para cron 15min | ☐ Yes / ☐ No (fallback hourly) | | Bloqueia Task 10-11 cron registration |
| DG-2 | Privacy lawyer review da DPIA (~€300 one-shot) | ☐ Ricardo / ☐ Lawyer / ☐ Depois | | Bloqueia Task 18 sign-off |
| DG-3 | DOB audit dos ~150 alunos no Yogo | ☐ None / ☐ Some (re-onboard) | | Resultado de Task 16; gate de go-live |
| DG-4 | Privacy notice URL slot | `/privacy/strikelab` | 2026-05-29 | ✅ default aceite |
| DG-5 | Legacy discount grandfathering | Deferido → Phase 1 | 2026-05-29 | ✅ scope decision |

## Spike status

| # | Spike | Estado | Output |
|---|---|---|---|
| 1 | Check-in timestamps | ✅ DONE | `signups.checked_in` Unix ms confirmado |
| 2 | Renewal detection | ✅ DONE | Snapshot-diff strategy validada |
| 3 | Discount code POST | ⏳ PENDING (manual DevTools, non-blocking) | [[yogo-spikes/SPIKE-3-MANUAL]] |
| 4 | DOB / user detail | ✅ DONE | DOB opcional — audit manual required |

## Como usar este ficheiro

Cada vez que tomas uma decisão, edita a tabela:
- Marca o checkbox / preenche "Decisão"
- Adiciona a "Data" (formato YYYY-MM-DD)
- Anota "Notas" se houver contexto que vais querer lembrar daqui a meses

Quando todas as DG estiverem resolvidas, este ficheiro vira reference doc do projecto — não muda mais.
