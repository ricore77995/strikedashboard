import { db } from "@/lib/db";
import { isReservarEnabled } from "@/lib/wa/config";
import { parseIntent, type MetaInboundMessage } from "@/lib/wa/parser";
import { isExpired, loadSession, resetToIdle, type SessionRow } from "@/lib/wa/session";
import { sendButton, sendText } from "@/lib/wa/meta";
import { renderFlowHint } from "@/lib/wa/render";
import {
  handleClassPick,
  handleConfirmBook,
  handleCancelBook,
  handleReservar,
} from "@/lib/wa/handlers/reservar";
import {
  handleAbortCancel,
  handleCancelPick,
  handleCancelPickByText,
  handleCancelar,
  handleConfirmCancel,
} from "@/lib/wa/handlers/cancelar";
import { endInteraction, handleContacto, handleOutros, sendMenu } from "@/lib/wa/handlers/menu";
import { handlePlaylistList } from "@/lib/wa/handlers/playlist-list";
import {
  handleSongInput,
  handleSongOfferButton,
  handleSongConfirm,
  handleSwapConfirm,
} from "@/lib/wa/handlers/song-request";
import {
  handleStrikelabOnboard,
  handleStrikelabConsent,
  handleStrikelabParental,
  handleStrikelabMe,
} from "@/lib/wa/handlers/strikelab-onboard";

// Dispatch routes an inbound WhatsApp message based on (1) menu button IDs,
// (2) the session's current state, and (3) the intent kind from the parser.
//
// Top-of-funnel UX: any text in IDLE shows the menu (Reservar / Minha agenda
// / Outros). The 3 button replies fire the corresponding flows from anywhere
// (state is reset first). `btn_voltar_menu` is a universal escape that ends
// any in-flight interaction. Mid-flow text resets to IDLE and re-shows the
// menu — no contextual text fallback.
export async function dispatch(phoneE164: string, message: MetaInboundMessage): Promise<void> {
  if (!isReservarEnabled()) {
    const body = message.text?.body ?? "";
    const result = await sendText(phoneE164, `echo: ${body}`);
    if (!result.ok) {
      await db.waEvent
        .create({
          data: {
            kind: "SEND_FAIL",
            phoneE164,
            meta: JSON.stringify({ status: result.status, body: result.body.slice(0, 300) }),
          },
        })
        .catch(() => undefined);
    }
    return;
  }

  const intent = parseIntent(message);
  let session = await loadSession(phoneE164);
  if (isExpired(session)) {
    const reset = await resetToIdle(session);
    if (reset.ok) session = reset.session;
  }

  // Menu/sub-menu picks arrive as buttons (main menu) or list rows ("Outros"
  // is a list). Capture the id from either kind. Flow-specific list picks (e.g.
  // numeric class ids) never match these btn_* names, so they fall through to
  // the state switch below.
  const navId = intent.kind === "button" || intent.kind === "list_pick" ? intent.id : null;

  // Universal escape: any state, any time.
  if (navId === "btn_voltar_menu") {
    return endInteraction(session, phoneE164);
  }

  // "strikelab" text trigger from IDLE
  if (intent.kind === "text" && intent.body.trim().toLowerCase() === "strikelab" &&
      (session.state === "IDLE" || session.state === "STRIKELAB_AWAIT_PARENTAL")) {
    return handleStrikelabOnboard(session);
  }

  // "Outros" sub-menu options (sent as a list → arrive as list_pick).
  if (navId === "btn_playlist") {
    return handlePlaylistList(phoneE164);
  }
  if (navId === "btn_contacto") {
    return handleContacto(phoneE164);
  }
  if (navId === "btn_strikelab_me") {
    return handleStrikelabMe(phoneE164);
  }

  // Top-of-funnel menu buttons reset state then fire the flow.
  if (intent.kind === "button") {
    if (intent.id === "btn_reservar") {
      const s = await ensureIdle(session, phoneE164);
      if (!s) return;
      return handleReservar(s);
    }
    if (intent.id === "btn_agenda") {
      const s = await ensureIdle(session, phoneE164);
      if (!s) return;
      return handleCancelar(s);
    }
    if (intent.id === "btn_outros") {
      const s = await ensureIdle(session, phoneE164);
      if (!s) return;
      return handleOutros(phoneE164);
    }
    // Otherwise fall through — flow-specific buttons are handled in switch.
  }

  switch (session.state) {
    case "AWAIT_CLASS_PICK":
      if (intent.kind === "list_pick") return handleClassPick(session, intent.id);
      if (intent.kind === "button" && intent.id === "confirm_book") return handleConfirmBook(session);
      if (intent.kind === "button" && intent.id === "cancel_book") return handleCancelBook(session);
      await resetToIdle(session);
      return sendMenu(phoneE164);

    case "AWAIT_CONFIRM_BOOK":
      if (intent.kind === "button" && intent.id === "confirm_book") return handleConfirmBook(session);
      if (intent.kind === "button" && intent.id === "cancel_book") return handleCancelBook(session);
      await resetToIdle(session);
      return sendMenu(phoneE164);

    case "AWAIT_CANCEL_PICK":
      if (intent.kind === "list_pick") return handleCancelPick(session, intent.id);
      if (intent.kind === "text") return handleCancelPickByText(session, intent.body);
      await resetToIdle(session);
      return sendMenu(phoneE164);

    case "AWAIT_CONFIRM_CANCEL":
      if (intent.kind === "button" && intent.id === "confirm_cancel") return handleConfirmCancel(session);
      if (intent.kind === "button" && intent.id === "abort_cancel") return handleAbortCancel(session);
      await resetToIdle(session);
      return sendMenu(phoneE164);

    case "AWAIT_SONG_INPUT":
      if (intent.kind === "button") {
        if (intent.id === "song_yes" || intent.id === "song_no") {
          return handleSongOfferButton(session, intent.id);
        }
        // Unknown button mid-flow — re-show offer
        return handleSongOfferButton(session, "song_yes");
      }
      if (intent.kind === "text") return handleSongInput(session, intent.body);
      // list_pick or anything else → hint with buttons
      await sendButton(
        phoneE164,
        renderFlowHint(
          "Manda o link da música (ex: https://open.spotify.com/track/...) ou cancela.",
          "song_no",
          "Cancelar",
        ),
      );
      return;

    case "AWAIT_SONG_CONFIRM":
      if (intent.kind === "button" && (intent.id === "song_confirm" || intent.id === "song_cancel")) {
        return handleSongConfirm(session, intent.id);
      }
      // Text fallback: sim/não → buttons
      if (intent.kind === "text") {
        const t = intent.body.trim().toLowerCase();
        if (t === "sim" || t === "s" || t === "yes" || t === "y") return handleSongConfirm(session, "song_confirm");
        if (t === "não" || t === "nao" || t === "n" || t === "no") return handleSongConfirm(session, "song_cancel");
      }
      await sendButton(
        phoneE164,
        renderFlowHint("Confirma ou cancela o pedido de música.", "song_confirm", "Confirmar"),
      );
      return;

    case "AWAIT_SWAP_CONFIRM":
      if (intent.kind === "button" && (intent.id === "replace_yes" || intent.id === "replace_no")) {
        return handleSwapConfirm(session, intent.id);
      }
      if (intent.kind === "text") {
        const t = intent.body.trim().toLowerCase();
        if (t === "sim" || t === "s" || t === "yes" || t === "y") return handleSwapConfirm(session, "replace_yes");
        if (t === "não" || t === "nao" || t === "n" || t === "no") return handleSwapConfirm(session, "replace_no");
      }
      await sendButton(
        phoneE164,
        renderFlowHint("Queres trocar a música anterior pela nova?", "replace_yes", "Sim, trocar"),
      );
      return;

    case "STRIKELAB_AWAIT_CONSENT":
      if (intent.kind === "button" && (intent.id === "strikelab_accept" || intent.id === "strikelab_decline")) {
        return handleStrikelabConsent(session, intent.id);
      }
      await resetToIdle(session);
      return sendMenu(phoneE164);

    case "STRIKELAB_AWAIT_PARENTAL":
      if (intent.kind === "text" && intent.body.trim().toLowerCase() === "strikelab") {
        return handleStrikelabOnboard(session);
      }
      if (intent.kind === "button" && intent.id === "strikelab_parental_done") {
        return handleStrikelabParental(session, intent.id);
      }
      await resetToIdle(session);
      return sendMenu(phoneE164);

    case "IDLE":
    default:
      return sendMenu(phoneE164);
  }
}

async function ensureIdle(session: SessionRow, phoneE164: string): Promise<SessionRow | null> {
  if (session.state === "IDLE") return session;
  const reset = await resetToIdle(session);
  if (!reset.ok) {
    await db.waEvent
      .create({ data: { kind: "SESSION_RACE", phoneE164 } })
      .catch(() => undefined);
    return null;
  }
  return reset.session;
}
