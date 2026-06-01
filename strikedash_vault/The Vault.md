# The Vault

Central index for Striker's House Dashboard documentation.

## Architecture & Design

- [[Leads-Hub-Refactor-2026-04-30]] — Unified Leads/Trials hub with Interessados + Follow-up stages
- [[WhatsApp-Bot-Design]] — Pull-based bot: aluno digita "reserva" → bot mostra aulas → reserva via Yogo
- [[WhatsApp-Bot-v1-Spec]] — v1 spec após adversarial review (7 slices, ~1260 LOC, ready-for-implementation 2026-05-25)
- [[WhatsApp-Bot-v1-Handoff-2026-05-25]] — session handoff: Slice 0 em PR #1, próxima acção = G2 phone spike
- [[WhatsApp-Bot-Pending]] — Open follow-ups after v1 launch (operational, quality, growth, hygiene) — 2026-05-26
- [[Spotify-Playlist-Per-Class-Design]] — Playlist Spotify por aula em grupo, request de música via WA bot, blocklist de géneros — 2026-05-26 (spec-locked)
- [[StrikeLab-v3]] — Gamification spec v3.0 (original — superseded)
- [[StrikeLab-v3.1-Refined]] — **Gamification refinada v3.1** após adversarial review (5 personas, 19 FATAL endereçadas) — 2026-05-28
- [[StrikeLab-Convergence-Report]] — Síntese da ronda adversarial: o que mudou, o que ficou, próximos passos
- [[StrikeLab-v3.2-final]] — **Spec consolidada FINAL** — 35 decisões aprovadas + 17 patches + 4 spike findings (2026-05-28)
- [[StrikeLab-Pontuacao-Mapa]] — **Mapa completo do sistema de pontuação** — todos os triggers, boosts, prémios, patentes, mensagens
- [[StrikeLab-Cobertura]] — **Coverage matrix** — 141 items mapeados spec ↔ docs ↔ tasks (45% Phase 0)
- [[StrikeLab-Fluxo.canvas|StrikeLab-Fluxo (canvas)]] — Fluxo visual aluno → gates → triggers → ledgers → side effects
- [[Yogo-StrikeLab-Gap-Report]] — Mapeamento API completo — tabela OK/gaps validada com dados reais
- [[StrikeLab-Phase-0-Handoff]] — **Phase 0 complete handoff** — architecture, data model, events, identity, consent, cron, admin UI, GDPR, tests, gotchas, Phase 1 plan, 40-file index
- [[StrikeLab-Phase-0-Production-Deploy]] — **Phase 0 production deploy** — code live, flags OFF, DOB audit results, go-live checklist
- [[StrikeLab-Phase-0-TODOs]] — **Open TODOs** — Marcelo DOBs, Vercel Pro, lawyer, go-live flags
- [[StrikeLab-Phase-1-Engine-Handoff]] — **Phase 1 engine handoff** — points, boosts, tiers, streaks, milestones, retro replay, 110 gamification tests
- [[StrikeLab-Sprint-8-Handoff]] — **Sprint 8 cold-start handoff** — full student loop (bot → magic link → progress page + leaderboard), auth model, file inventory, deploy checklist, GDPR decision, gotchas
- [[StrikeLab-Sprint-8-Student-UI]] — **Sprint 8 working log** — detailed per-slice notes (1–5): admin page, self-service API, student page, WhatsApp menu link, leaderboard
- [Phase 0 Final Plan](../docs/superpowers/plans/2026-05-28-strikelab-phase-0-final.md) — 21 tarefas, ~37h, 2.5 semanas (executed plan)

## API References

- [[Yogo-API]] — Yogo Booking API: auth, endpoints, status semantics, recipes
- [[Spotify-API]] — Spotify Web API: OAuth flow, scopes, quota modes (cause of 403), endpoints, troubleshooting

## Features

- [[WhatsApp-Group-Invite-Rollout-2026-05-27]] — Bulk WhatsApp group invite from coverage page (PR #18+#23). **BLOQUEADO** por sandbox limit — ver handoff abaixo.
- [[WhatsApp-Cloud-API-Sandbox-Limitation-2026-05-28]] — Caminho A (5-recipient allow-list) + caminho B (registar nº próprio + business verification) para escalar bulk send para 32+ destinatários.

## Data & Filtering

- [[Spotify-Filter-Field-Scoping-2026-05-28]] — Filtro de músicas WA: explícito permitido + keywords com match por campo (género/artista/título) — 2026-05-28

## Navigation & UI

_(To be added as we document nav structure)_

## Gotchas & Patterns

_(To be added as we discover patterns)_
