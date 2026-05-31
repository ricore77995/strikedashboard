Autoresearch for Coding — Real Examples

  1. Fix a flaky/failing test suite

  /autoresearch:fix
  Target: src/**/*.test.ts
  Scope: src/**/*.ts
  Iterations: 15
  Runs tests, fixes one error per iteration, auto-reverts regressions. Stops at zero errors.
  
  2. Hunt bugs in a specific feature

  /autoresearch:debug
  Issue: WhatsApp invite sometimes sends duplicates
  Scope: src/app/api/whatsapp/**/*.ts, src/lib/wa-invite.ts
  Scientific method loop — forms hypotheses, tests each, logs findings until codebase is clean.
  
  3. Shrink a fat file / refactor

  /autoresearch
  Goal: Reduce src/lib/yogo-proxy.ts under 200 LOC without breaking tests
  Scope: src/lib/yogo-proxy.ts
  Metric: wc -l src/lib/yogo-proxy.ts | awk '{print $1}'
  Direction: lower is better
  Verify: npm test
  Guard: npx tsc --noEmit
  Iterations: 20

  4. Increase test coverage

  /autoresearch
  Goal: Coverage above 80% on lib/
  Scope: src/lib/**/*.ts, tests/**/*.ts
  Verify: npx vitest run --coverage 2>&1 | grep 'All files' | awk '{print $10}'
  Direction: higher is better
  Iterations: 25

  5. Security audit before shipping a feature

  /autoresearch:security --diff
  Scope: src/app/api/**/*.ts
  Focus: authentication, IDOR, input validation
  --diff only audits what changed since last audit. Add --fix to auto-patch Critical/High.
  
  6. Pre-deploy quality sweep (multi-perspective)

  /autoresearch:predict --depth deep --chain debug,fix
  Scope: src/app/api/whatsapp/**
  Goal: Find issues before merging feat/wa-group-invite
  5 expert personas debate → top hypotheses → debug investigates → fix repairs.

  7. Generate / refresh docs

  /autoresearch:learn --mode update
  Scope: src/app/api/**
  Reads code, regenerates docs in docs/, validates references match reality.
  
  8. Stress-test a feature with edge cases

  /autoresearch:scenario --depth standard --focus edge-cases
  Scenario: Admin clicks "Convidar todos" on a class with 50 attendees, half have stale phone numbers
  Domain: software
  Generates 25+ situations across 12 dimensions (concurrent, scale, abuse, recovery, etc.).

  9. Ship a PR with full preflight

  /autoresearch:ship --auto --monitor 10
  Auto-detects type (PR), runs checklist, dry-runs, ships if all green, watches 10 min post-merge.

  10. Decision before implementing

  /autoresearch:reason --judges 5
  Task: Should WhatsApp invite state live in SQLite or as a Yogo customer note?
  Domain: software
  Two authors debate, synthesizer merges, 5 blind judges pick winner until convergence.