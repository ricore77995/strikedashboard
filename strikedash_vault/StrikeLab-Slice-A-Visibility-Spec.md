---
status: shipped
---
# StrikeLab Slice A — Visibility Spec

**Date:** 2026-06-02 · **Status:** Spec-locked
**Parent:** [[StrikeLab-Next-Phase-Visibility]]

## Goal

StrikeLab admin reachable from 'Mais' page + honest engine health overview above existing student list. 4 files changed, ~80-100 LOC, no new files.

## Design Decisions

- **Nav:** StrikeLab card in more/page.tsx SECTIONS (admin-only, same level as WA bot)
- **Overview:** Stats header on existing strikelab page (3 stat boxes + challenge status)
- **API:** Extend existing GET /api/strikelab/admin with stats object (no new endpoint)
- **Cold start:** All zeroes shown honestly — '0 alunos activos', 'Sem desafio activo'

## Files Changed

1. src/app/dashboard/more/page.tsx — SECTIONS entry
2. src/lib/constants.ts — ADMIN_ONLY_ROUTES
3. src/app/api/strikelab/admin/route.ts — stats in response
4. src/app/dashboard/strikelab/page.tsx — stats header UI

## Deferred

- 'Last poll run' timestamp (no tracking mechanism exists)
- Slice B challenge UI

**Full spec:** docs/superpowers/specs/2026-06-02-strikelab-slice-a-visibility.md