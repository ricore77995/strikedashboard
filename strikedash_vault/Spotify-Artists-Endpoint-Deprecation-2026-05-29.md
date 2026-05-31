---
title: Spotify /v1/artists Batch Endpoint Deprecation
type: technical
status: fixed
date: 2026-05-29
related: "[[Spotify-Filter-Field-Scoping-2026-05-28]]", "[[Spotify-API]]"
---

# Spotify /v1/artists Batch Endpoint Deprecation

## Problem

`evaluateTrack()` called `GET /v1/artists?ids=` to fetch genres for all artists on a track. This endpoint returns **403 Forbidden** for new Spotify Web API apps — the same deprecation pattern as `/playlists/{id}/tracks` → `/items` (fixed May 27).

**Result:** Every song request failed with `Artist lookup failed: 403`. Zero songs were ever successfully added to any playlist.

## Evidence

Production DB `WaEvent` records:
```
[2026-05-28T23:40:35] SONG_EVAL_FAIL — "Artist lookup failed: 403" (trackId: 2AlFZH3uIA6IYesRZUby7k)
[2026-05-28T23:34:04] SONG_EVAL_FAIL — "Artist lookup failed: 403" (trackId: 15JINEqzVMv3SvJTAXAKED)
[2026-05-28T11:48:05] DISPATCH_FAIL   — "Artist lookup failed: 403"
[2026-05-28T08:12:15] DISPATCH_FAIL   — "Artist lookup failed: 403"
[2026-05-28T08:11:30] DISPATCH_FAIL   — "Artist lookup failed: 403"
```

All 3 entries in `WaSongRequest` are `rejected_explicit` — **no song was ever accepted**.

## Which endpoints work

| Endpoint | Status | Notes |
|---|---|---|
| `GET /v1/tracks/{id}` | ✅ 200 | Track name, artists, URI — no genres |
| `GET /v1/artists/{id}` | ✅ 200 | Name, images — **no genres in Dev Mode** |
| `GET /v1/artists?ids=` | ❌ 403 | Batch endpoint deprecated |
| `GET /v1/artists/{id}/related` | ❌ 403 | Related artists deprecated |
| `POST /v1/playlists/{id}/items` | ✅ 200 | Playlist add (after /tracks → /items fix) |

## Fix (commit 3d28b98)

Replace `GET /v1/artists?ids=a,b,c` with individual `GET /v1/artists/a` calls for each artist. Gracefully handle empty genres — artist blocklist and track-name keywords still work.

## Limitation

Spotify Development Mode does NOT return `genres` or `popularity` on the artist endpoint. Genre-based filtering is effectively disabled until:
- Spotify app is approved for Extended Quota Mode, OR
- A third-party genre database is used as fallback

Artist blocklist (by Spotify artist ID) and track-name keyword filtering continue to work.
