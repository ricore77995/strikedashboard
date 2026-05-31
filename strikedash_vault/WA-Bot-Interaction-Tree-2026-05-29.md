---
title: WA Bot Interaction Tree
type: technical
status: current
date: 2026-05-29
related: "[[WhatsApp-Bot-Design]]", "[[WhatsApp-Cloud-API-Sandbox-Limitation-2026-05-28]]"
---

# WA Bot Interaction Tree (post-fix)

All terminal interactions now end with the menu (kiosk-style). Commit `50aa631`.

## States

`IDLE` → `AWAIT_CLASS_PICK` → `AWAIT_CONFIRM_BOOK` → `AWAIT_SONG_INPUT` → `AWAIT_SONG_CONFIRM` → `AWAIT_SWAP_CONFIRM`
`IDLE` → `AWAIT_CANCEL_PICK` → `AWAIT_CONFIRM_CANCEL`

## Key rules

1. **Universal escape:** `btn_voltar_menu` from any state → `endInteraction` (menu)
2. **Every terminal ends with menu:** via `endInteraction` (session flows) or `sendMenu` (stateless)
3. **Mid-flow invalid input:** stays in state, shows hint with Cancelar/Voltar buttons
4. **Session TTL:** each transition resets the expiry; expired sessions reset to IDLE + menu

## Stateless flows (no session change)

- **btn_outros** → sub-menu {Playlist, Contacto, Voltar}
- **btn_playlist** → handlePlaylistList → links → menu
- **btn_contacto** → handleContacto → contact text → menu
