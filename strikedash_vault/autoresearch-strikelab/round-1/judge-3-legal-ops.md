---
title: Judge 3 — Legal Compliance + Operational Sustainability
type: reference
round: 1
judge: legal-ops
date: 2026-05-28
---

```
WINNER: Y
RUNNER-UP: X
```

## REASONING

On every dimension the brief asks to grade — Portugal/EU GDPR exposure and the operational load on a single overloaded operator — X is not even competing in the same weight class as Y. X has no lawful basis declared anywhere; the closest it comes is `antiAbuse.duplicateAccountDetection` (X line 170) which casually proposes monitoring "name + phone + email + payment_method overlap" with no Art. 6(1)(f) LIA, no DPIA, and no Art. 30 register. Y states the lawful basis per processing category in a dedicated table (Y §10.1) and explicitly pins UGC and ranking to Art. 6(1)(a) explicit consent, anti-fraud to Art. 6(1)(f) with a documented LIA, and tier-with-economic-effect to contract + Art. 22 human confirmation. X has no opt-in flow at all; Y §10.2 defines a four-checkbox granular consent capture with `consent_version` stored on `gamification_identity` and per-category `/optout`. That alone is the CNPD-complaint delta.

On Art. 22, X tier evaluation is described as "Continuous — tier re-evaluated on every XP credit" (X line 184), which is exactly the automated-decision-with-legal-or-similarly-significant-effect pattern Art. 22 prohibits without human review — and discounts, free sessions, and a permanent wall photo are squarely "similarly significant effects." Y §10.5 and §8.4 explicitly route every tier promotion through an admin confirmation queue (Y §11.1 screen 3) before any economic benefit unlocks, and documents the right to human review. On Art. 17, X has no erasure path; the dual-ledger XP is described as "Acumula para sempre, nunca decresce" (X line 16) with the wall photo "Permanent photo on academy wall" (X line 138) — both creating direct erasure conflicts. Y §3.2, §10.4 and §8.3 implement a concrete tombstone + event-log redaction + 7-day wall-photo removal SLA. Minors (Art. 8) are absent from X entirely; Y §10.6 excludes <13 and requires scanned parental consent for 13–17.

On health-discriminatory penalties, X retains `inactivity_long -50 pts` and `broken_streak -30 pts` (X lines 86-87) with no pause concept — a subscriber on chemo or with a knee injury silently bleeds points and is publicly visible on the leaderboard losing them. Y §5.3 deletes both penalties outright and adds medical/vacation/personal pause flags (Y §11.1 screen 5) that suppress even the neutral check-in. Y §10.7 also defaults public ranking to pseudonym, where X has no pseudonym concept at all — winners are broadcast by name with no opt-in.

Operationally, X assumes Marcelo will manually validate Diamante (X line 132) with no rubric, manually curate two weekly challenges (X line 113), manually issue tier discounts (no delivery mechanism defined anywhere in X), manually catch ManyChat false negatives with no UI, and manually deliver "1 mês grátis" (X line 156) — every one of these is a hidden weekly hour on someone who already runs the academy. Y §11.1 ships 13 concrete admin screens including the Diamante rubric (Y §8.4 two-of-three criteria), the discount-batch tool, a UGC manual approve queue, the prize-redemption POS with stock alerts, and a pause-flag toggle. Y also cuts the weekly challenge cadence from 2× to 1× (Y §7) with a fixed pool of 5 and pre-scheduled coach briefings, which is the realistic ceiling for one operator. The US-processor transfer problem (ManyChat, Vercel, Turso) is invisible in X and addressed in Y §10.3 with DPA + SCC signature as a Phase 0 gate.

## WINNING_STRENGTH

Y treats GDPR and ops as load-bearing structural requirements (lawful-basis table, opt-in flow, erasure path, minors carve-out, 13 admin screens, pause flags, Art. 22 confirmation queue) rather than as policy aspirations. It is the only one of the two specs that a Portuguese small business could put in front of CNPD without immediately rewriting.

## RUNNER_UP_GAP

X has no opt-in, no lawful basis, no Art. 22 mitigation, no Art. 17 path, no minors handling, no pause flags, retains health-discriminatory point penalties, lifetime-permanent XP that conflicts with erasure, and defines zero admin UI for benefit delivery — Marcelo would be drowning by month two and Strike House would be one student complaint away from a CNPD file.
