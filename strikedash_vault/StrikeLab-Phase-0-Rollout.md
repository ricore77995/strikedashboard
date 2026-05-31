---
title: StrikeLab Phase 0 — Rollout Checklist
type: design
status: open
created: 2026-05-29
tags:
  - strikelab
  - phase-0
  - rollout
related:
  - "[[StrikeLab-Phase-0-Decisions]]"
  - "[[StrikeLab-Phase-0-Core-Engine]]"
  - "[[StrikeLab-v3.2-final]]"
---

# StrikeLab Phase 0 — Rollout Checklist

> Marca cada item quando completo. Todos devem estar ✅ antes do go-live.

## Decision Gates

| # | Gate | Status | Notas |
|---|------|--------|-------|
| DG-1 | Vercel Pro upgrade (~€20/mês) | ☐ | Sem Pro → cron horário (não 15min) |
| DG-2 | Privacy lawyer review DPIA (~€300) | ☐ | Ver [[DPIA-StrikeLab]] |
| DG-3 | DOB audit completo | ☐ | Ver [[StrikeLab-DOB-Missing.csv]] |
| DG-4 | Privacy notice publicada | ☐ | `/privacy/strikelab` |
| DG-5 | Legacy discounts | ☐ | Deferido → Phase 1 |

## Infrastructure

- [ ] Vercel Pro activado (ou fallback hourly aceitado)
- [ ] Turso production database provisioned
- [ ] `DATABASE_URL` e `DATABASE_AUTH_TOKEN` configurados no Vercel
- [ ] `STRIKELAB_ENABLED=true` no Vercel env
- [ ] `STRIKELAB_POLL_CLASSES_ENABLED=true` no Vercel env
- [ ] `STRIKELAB_POLL_MEMBERSHIPS_ENABLED=true` no Vercel env
- [ ] `STRIKELAB_OPS_START_HOUR=6` configurado
- [ ] `STRIKELAB_OPS_END_HOUR=23` configurado
- [ ] `CRON_SECRET` configurado no Vercel
- [ ] Prisma migration aplicada em Turso production

## Code & Tests

- [x] Branch `worktree-strikelab-phase0-core` mergeada para main
- [x] 396/396 tests passing (60 gamification-specific)
- [x] TypeScript strict — zero errors
- [x] `npm run build` passa sem erros
- [x] Monthly reset implementado (reset.ts + cron route + 6 tests)
- [ ] Smoke test em preview deployment

## GDPR & Legal

- [x] [[DPIA-StrikeLab]] criada
- [x] [[ROPA-Strikelab]] criada
- [x] [[Lawful-Basis-Register]] criado
- [x] [[Retention-Policy]] criada
- [x] [[Processor-Agreements]] criada
- [ ] DPIA assinada pelo responsável + advogado
- [ ] DPA Vercel confirmado
- [ ] DPA Turso confirmado
- [ ] Yogo API terms verificados
- [ ] WhatsApp Business API terms verificados
- [x] [[Privacy-Notice-StrikeLab]] publicada em `/privacy/strikelab`

## Audit & Data

- [ ] `scripts/strikelab-minors-audit.ts` executado
- [ ] [[StrikeLab-DOB-Missing.csv]] — zero rows OU excepções documentadas
- [ ] [[StrikeLab-Minors-Audit.csv]] — menores identificados, consentimento parental preparado
- [ ] Spike 3 (discount code POST) — capturado ou CSV fallback aceite

## Go-Live Sequence

1. Merge branch → main
2. Deploy to Vercel preview
3. Smoke test em preview
4. Resolver DG-1 (Vercel Pro)
5. Resolver DG-2 (DPIA assinatura)
6. Resolver DG-3 (DOB audit limpo)
7. Configurar env vars em production
8. Deploy to production
9. Activar `STRIKELAB_ENABLED=true`
10. Activar `STRIKELAB_POLL_CLASSES_ENABLED=true`
11. Activar `STRIKELAB_POLL_MEMBERSHIPS_ENABLED=true`
12. Verificar cron jobs a executar no Vercel
13. Teste manual: escrever "strikelab" no WhatsApp bot
14. Confirmar primeiro poll de classes com sucesso
15. Confirmar primeiro poll de memberships com sucesso

## Artefactos

| Artefacto | Localização |
|-----------|------------|
| Spec v3.2-final | [[StrikeLab-v3.2-final]] |
| Core engine docs | [[StrikeLab-Phase-0-Core-Engine]] |
| Decisions log | [[StrikeLab-Phase-0-Decisions]] |
| Coverage matrix | [[StrikeLab-Cobertura]] |
| Scoring system | [[StrikeLab-Pontuacao-Mapa]] |
| DPIA | [[DPIA-StrikeLab]] |
| ROPA | [[ROPA-Strikelab]] |
| Privacy notice | [[Privacy-Notice-StrikeLab]] |
| Rollout checklist | Este documento |
