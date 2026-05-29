import { db } from "@/lib/db";
import { sendButton, sendText } from "@/lib/wa/meta";
import {
  renderSongOffer,
  renderSongConfirm,
  renderReplaceConfirm,
  renderFlowHint,
} from "@/lib/wa/render";
import { loadSession, transition, ttlFromNow, type SessionRow } from "@/lib/wa/session";
import { parseSpotifyTrackId } from "@/lib/wa/parser";
import { evaluateTrack, type EvaluateResult } from "@/lib/spotify/genre-filter";
import {
  insertSongAtNextPosition,
  swapSong,
  removeSongAndRecompress,
  createClassPlaylist,
} from "@/lib/spotify/playlist-manager";
import { listClasses, parseClassStart } from "@/lib/yogo/signups";
import { endInteraction } from "@/lib/wa/handlers/menu";

const WINDOW_CLOSED =
  "Esta aula já começou há mais de 10 min — pedidos fechados.";

// Create the per-class playlist on demand if the daily cron hasn't run yet.
export async function ensureClassPlaylist(yogoClassId: number) {
  const existing = await db.waClassPlaylist.findUnique({ where: { yogoClassId } });
  if (existing) return existing;

  const todayIso = new Date().toISOString().slice(0, 10);
  const inSevenDaysIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const classes = await listClasses(todayIso, inSevenDaysIso);
  const klass = classes.find((k) => k.id === yogoClassId);
  if (!klass) return null;
  if (typeof klass.seats === "number" && klass.seats <= 1) return null;
  const start = parseClassStart(klass);
  if (!start) return null;

  try {
    await createClassPlaylist({
      yogoClassId,
      className: klass.class_type?.name ?? `Class ${yogoClassId}`,
      startsAtIso: start.toISOString(),
    });
  } catch {
    return null;
  }
  return db.waClassPlaylist.findUnique({ where: { yogoClassId } });
}

export async function offerSongRequest(phoneE164: string, yogoClassId: number): Promise<void> {
  const playlist = await ensureClassPlaylist(yogoClassId);
  if (!playlist || playlist.locked) return;

  const existing = await db.waSongRequest.findFirst({
    where: { contactId: phoneE164, yogoClassId, status: "active" },
  });
  if (existing) return;

  const session = await loadSession(phoneE164);
  const t = await transition(session, {
    state: "AWAIT_SONG_INPUT",
    pendingSongClassId: yogoClassId,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) return;

  await sendButton(phoneE164, renderSongOffer());
}

// AWAIT_SONG_INPUT + button reply. Buttons are the primary UX now; free-text
// link still works as fallback for users typing the URL.
export async function handleSongOfferButton(session: SessionRow, buttonId: string): Promise<void> {
  const phoneE164 = session.phoneE164;
  if (buttonId === "song_no") {
    await endInteraction(session, phoneE164);
    return;
  }
  if (buttonId === "song_yes") {
    await sendText(
      phoneE164,
      "Manda o link da música no Spotify (ex: https://open.spotify.com/track/...) 🥷",
    );
    return;
  }
  await sendButton(phoneE164, renderSongOffer());
}

export async function handleSongInput(session: SessionRow, body: string): Promise<void> {
  const phoneE164 = session.phoneE164;
  const text = body.trim().toLowerCase();

  if (text === "não" || text === "nao" || text === "no" || text === "n") {
    await endInteraction(session, phoneE164);
    return;
  }

  const trackId = parseSpotifyTrackId(body);
  if (!trackId) {
    await sendButton(
      phoneE164,
      renderFlowHint(
        "Não consegui ler esse link. Manda um link Spotify (https://open.spotify.com/track/...) ou volta ao menu.",
        "song_no",
        "Cancelar",
      ),
    );
    return;
  }

  if (!session.pendingSongClassId) {
    await sendText(phoneE164, "Não consegui ligar este pedido a uma aula tua 🥷");
    await endInteraction(session, phoneE164);
    return;
  }
  const yogoClassId = session.pendingSongClassId;

  const playlist = await db.waClassPlaylist.findUnique({ where: { yogoClassId } });
  if (!playlist) {
    await sendText(phoneE164, "A playlist desta aula ainda não está pronta. Tenta de novo daqui a 1min 🥷");
    await endInteraction(session, phoneE164);
    return;
  }
  if (playlist.locked) {
    await db.waSongRequest.create({
      data: {
        contactId: phoneE164,
        yogoClassId,
        spotifyTrackId: trackId,
        spotifyTrackName: "(window closed)",
        spotifyArtistName: "(window closed)",
        spotifyTrackUri: `spotify:track:${trackId}`,
        position: -1,
        status: "rejected_window",
        rejectedReason: "playlist locked",
      },
    });
    await sendText(phoneE164, WINDOW_CLOSED);
    await endInteraction(session, phoneE164);
    return;
  }

  let result: EvaluateResult;
  try {
    result = await evaluateTrack(trackId);
  } catch (err) {
    await db.waEvent
      .create({
        data: {
          kind: "SONG_EVAL_FAIL",
          phoneE164,
          meta: JSON.stringify({ trackId, error: String(err).slice(0, 500) }),
        },
      })
      .catch(() => undefined);
    await sendText(
      phoneE164,
      "Não consegui verificar essa música no Spotify agora 🥷\nTenta outra ou tenta de novo daqui a 1min.",
    );
    await endInteraction(session, phoneE164);
    return;
  }

  if (result.outcome === "reject_genre") {
    await db.waSongRequest.create({
      data: {
        contactId: phoneE164,
        yogoClassId,
        spotifyTrackId: trackId,
        spotifyTrackName: result.trackName,
        spotifyArtistName: result.artistName,
        spotifyTrackUri: `spotify:track:${trackId}`,
        position: -1,
        status: "rejected_genre",
        rejectedReason: result.matchedKeyword,
      },
    });
    await sendText(
      phoneE164,
      `Esta música é classificada como ${result.matchedKeyword} pelo Spotify. A casa só toca rock, hip-hop, rap e pop. Tenta outra 🥷`,
    );
    await endInteraction(session, phoneE164);
    return;
  }

  if (result.outcome === "reject_artist") {
    await db.waSongRequest.create({
      data: {
        contactId: phoneE164,
        yogoClassId,
        spotifyTrackId: trackId,
        spotifyTrackName: result.trackName,
        spotifyArtistName: result.artistName,
        spotifyTrackUri: `spotify:track:${trackId}`,
        position: -1,
        status: "rejected_artist",
        rejectedReason: result.blockedArtistName,
      },
    });
    await sendText(
      phoneE164,
      `O artista ${result.blockedArtistName} está bloqueado. Tenta outra música 🥷`,
    );
    await endInteraction(session, phoneE164);
    return;
  }

  // Accept → preview + confirm buttons
  const t = await transition(session, {
    state: "AWAIT_SONG_CONFIRM",
    pendingTrackId: result.trackId,
    expiresAt: ttlFromNow(),
  });
  if (!t.ok) {
    await db.waEvent
      .create({
        data: {
          kind: "SESSION_RACE",
          phoneE164,
          meta: JSON.stringify({ where: "handleSongInput.accept", trackId }),
        },
      })
      .catch(() => undefined);
    await endInteraction(session, phoneE164);
    return;
  }

  await sendButton(phoneE164, renderSongConfirm(result.trackName, result.artistName));
}

// AWAIT_SONG_CONFIRM. Buttons: song_confirm / song_cancel.
export async function handleSongConfirm(session: SessionRow, buttonId: string): Promise<void> {
  const phoneE164 = session.phoneE164;

  if (buttonId === "song_cancel") {
    await endInteraction(session, phoneE164);
    return;
  }
  if (buttonId !== "song_confirm") {
    if (!session.pendingTrackId) {
      await endInteraction(session, phoneE164);
      return;
    }
    // Unknown button mid-confirm — re-show the confirm prompt
    await sendButton(
      phoneE164,
      renderFlowHint("Confirma ou cancela o pedido de música.", "song_cancel", "Cancelar"),
    );
    return;
  }

  if (!session.pendingSongClassId || !session.pendingTrackId) {
    await endInteraction(session, phoneE164);
    return;
  }
  const yogoClassId = session.pendingSongClassId;
  const trackId = session.pendingTrackId;

  let result: EvaluateResult;
  try {
    result = await evaluateTrack(trackId);
  } catch (err) {
    await db.waEvent
      .create({
        data: {
          kind: "SONG_EVAL_FAIL",
          phoneE164,
          meta: JSON.stringify({ trackId, where: "confirm", error: String(err).slice(0, 500) }),
        },
      })
      .catch(() => undefined);
    await sendText(phoneE164, "Falhou a confirmar com o Spotify. Tenta de novo daqui a 1min 🥷");
    await endInteraction(session, phoneE164);
    return;
  }
  if (result.outcome !== "accept") {
    await sendText(phoneE164, "A música deixou de ser aceitável (verificação falhou). Tenta outra 🥷");
    await endInteraction(session, phoneE164);
    return;
  }

  const existing = await db.waSongRequest.findFirst({
    where: { contactId: phoneE164, yogoClassId, status: "active" },
  });

  if (existing) {
    const t = await transition(session, {
      state: "AWAIT_SWAP_CONFIRM",
      pendingSongClassId: yogoClassId,
      pendingTrackId: trackId,
      expiresAt: ttlFromNow(),
    });
    if (!t.ok) {
      await db.waEvent
        .create({
          data: { kind: "SESSION_RACE", phoneE164, meta: JSON.stringify({ where: "handleSongConfirm.replace" }) },
        })
        .catch(() => undefined);
      await endInteraction(session, phoneE164);
      return;
    }
    await sendButton(
      phoneE164,
      renderReplaceConfirm(
        existing.spotifyTrackName,
        existing.spotifyArtistName,
        result.trackName,
        result.artistName,
      ),
    );
    return;
  }

  let ins;
  try {
    ins = await insertSongAtNextPosition({
      yogoClassId,
      trackUri: result.trackUri,
    });
  } catch (err) {
    await db.waEvent
      .create({
        data: {
          kind: "SONG_INSERT_FAIL",
          phoneE164,
          meta: JSON.stringify({ yogoClassId, trackUri: result.trackUri, error: String(err).slice(0, 500) }),
        },
      })
      .catch(() => undefined);
    await sendText(
      phoneE164,
      "Falhou a adicionar à playlist (erro no Spotify). Tenta outra vez daqui a 1min 🥷",
    );
    await endInteraction(session, phoneE164);
    return;
  }

  await db.waSongRequest.create({
    data: {
      contactId: phoneE164,
      yogoClassId,
      spotifyTrackId: result.trackId,
      spotifyTrackName: result.trackName,
      spotifyArtistName: result.artistName,
      spotifyTrackUri: result.trackUri,
      position: ins.position,
      status: "active",
    },
  });

  const playlist = await db.waClassPlaylist.findUnique({ where: { yogoClassId } });
  const playlistLink = playlist
    ? `\nhttps://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`
    : "";
  await sendText(
    phoneE164,
    `Adicionado! 🥷\n\n*${result.trackName}* — ${result.artistName}\nVai tocar na 1ª posição da playlist da tua aula.${playlistLink}`,
  );
  await endInteraction(session, phoneE164);
}

export async function removeSongOnCancel(phoneE164: string, yogoClassId: number): Promise<void> {
  const active = await db.waSongRequest.findFirst({
    where: { contactId: phoneE164, yogoClassId, status: "active" },
  });
  if (!active) return;
  try {
    await removeSongAndRecompress(active.id);
  } catch (err) {
    await db.waEvent.create({
      data: {
        kind: "SONG_REMOVE_FAIL",
        phoneE164,
        meta: JSON.stringify({ requestId: active.id, error: String(err) }),
      },
    });
  }
}

// AWAIT_SWAP_CONFIRM — used for the "cancel old + insert new" replace flow.
// Buttons: replace_yes / replace_no.
export async function handleSwapConfirm(session: SessionRow, buttonId: string): Promise<void> {
  const phoneE164 = session.phoneE164;

  if (buttonId !== "replace_yes") {
    await sendText(phoneE164, "Mantida a anterior. 🥷");
    await endInteraction(session, phoneE164);
    return;
  }

  if (!session.pendingSongClassId || !session.pendingTrackId) {
    await endInteraction(session, phoneE164);
    return;
  }
  const yogoClassId = session.pendingSongClassId;
  const trackId = session.pendingTrackId;

  const old = await db.waSongRequest.findFirst({
    where: { contactId: phoneE164, yogoClassId, status: "active" },
  });
  if (!old) {
    await endInteraction(session, phoneE164);
    return;
  }

  let result: EvaluateResult;
  try {
    result = await evaluateTrack(trackId);
  } catch (err) {
    await db.waEvent
      .create({
        data: {
          kind: "SONG_EVAL_FAIL",
          phoneE164,
          meta: JSON.stringify({ trackId, where: "replace", error: String(err).slice(0, 500) }),
        },
      })
      .catch(() => undefined);
    await sendText(phoneE164, "Falhou a trocar com o Spotify. Tenta de novo daqui a 1min 🥷");
    await endInteraction(session, phoneE164);
    return;
  }
  if (result.outcome !== "accept") {
    await endInteraction(session, phoneE164);
    return;
  }

  try {
    await swapSong({
      oldRequestId: old.id,
      newTrackUri: result.trackUri,
      newTrackId: result.trackId,
      newTrackName: result.trackName,
      newArtistName: result.artistName,
      contactId: phoneE164,
    });
  } catch (err) {
    await db.waEvent
      .create({
        data: {
          kind: "SONG_INSERT_FAIL",
          phoneE164,
          meta: JSON.stringify({ where: "replace", error: String(err).slice(0, 500) }),
        },
      })
      .catch(() => undefined);
    await sendText(phoneE164, "Falhou a trocar (erro no Spotify). Tenta de novo daqui a 1min 🥷");
    await endInteraction(session, phoneE164);
    return;
  }

  const playlist = await db.waClassPlaylist.findUnique({ where: { yogoClassId } });
  const playlistLink = playlist
    ? `\nhttps://open.spotify.com/playlist/${playlist.spotifyPlaylistId}`
    : "";
  await sendText(
    phoneE164,
    `Trocada! 🥷\n\n*${result.trackName}* — ${result.artistName}\nSubstituiu a anterior.${playlistLink}`,
  );
  await endInteraction(session, phoneE164);
}
