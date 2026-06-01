// WA interactive payloads. List rows are 24c title / 72c description / max 10
// rows per section. We use two sections (HOJE, AMANHÃ) so practical cap is 20
// classes; anything past that falls back to a text instruction.

export interface YogoClassLite {
  id: number;
  date: string;
  start_time: string;
  class_type?: { name?: string } | null;
  signup_count?: number;
  seats?: number;
}

export interface WaListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WaListSection {
  title: string;
  rows: WaListRow[];
}

export interface WaListPayload {
  type: "list";
  bodyText: string;
  buttonText: string;
  sections: WaListSection[];
}

export interface WaTextPayload {
  type: "text";
  body: string;
}

export interface WaButtonPayload {
  type: "button";
  bodyText: string;
  buttons: Array<{ id: string; title: string }>;
}

const MAX_ROW_TITLE = 24;
const MAX_ROW_DESC = 72;
// WhatsApp interactive lists allow at most 10 ROWS in total across all
// sections (verified live 2026-05-26 via Meta error 131009 "Total row
// count exceed max allowed count: 10" — the per-section "10 rows" limit
// in older docs is a per-section cap, but the GRAND TOTAL is also 10).
const MAX_TOTAL_ROWS = 10;

export function renderClassList(
  classes: YogoClassLite[],
  todayDate: string,
  tomorrowDate: string,
): WaListPayload | WaTextPayload {
  const todayAll = classes.filter((c) => c.date === todayDate);
  const tomorrowAll = classes.filter((c) => c.date === tomorrowDate);

  if (todayAll.length === 0 && tomorrowAll.length === 0) {
    return { type: "text", body: "Sem aulas disponíveis hoje ou amanhã." };
  }

  // Prioritise today; fill the remaining slots with tomorrow. If today alone
  // overflows MAX_TOTAL_ROWS, we drop to a free-text instruction since the
  // user can't fit a meaningful picker.
  if (todayAll.length > MAX_TOTAL_ROWS) {
    const sample = todayAll[0]?.start_time ?? "19:30";
    return {
      type: "text",
      body: `Hoje temos ${todayAll.length} aulas. Escreve a hora (ex: ${sample}) para reservar directamente.`,
    };
  }

  const today = todayAll;
  const tomorrowBudget = Math.max(0, MAX_TOTAL_ROWS - today.length);
  const tomorrow = tomorrowAll.slice(0, tomorrowBudget);
  const tomorrowDropped = tomorrowAll.length - tomorrow.length;

  const sections: WaListSection[] = [];
  if (today.length > 0) sections.push({ title: "HOJE", rows: today.map(toRow) });
  if (tomorrow.length > 0) sections.push({ title: "AMANHÃ", rows: tomorrow.map(toRow) });

  const bodyText =
    tomorrowDropped > 0
      ? `Escolhe a aula. (Mais ${tomorrowDropped} aula${tomorrowDropped === 1 ? "" : "s"} amanhã — escreve a hora para reservar uma dessas, ex: 19:30)`
      : "Escolhe a aula para reservar:";

  return { type: "list", bodyText, buttonText: "Ver aulas", sections };
}

export function renderConfirmBook(klass: YogoClassLite): WaButtonPayload {
  const name = klass.class_type?.name ?? "Aula";
  const time = `${klass.start_time}`;
  return {
    type: "button",
    bodyText: truncate(`Confirmas? ${name} · ${time}`, 1024),
    buttons: [
      { id: "confirm_book", title: "Sim, reservar" },
      { id: "cancel_book", title: "Cancelar" },
    ],
  };
}

export interface SignupLite {
  id: number;
  klass: YogoClassLite;
}

// Agenda picker — used by the "Minha agenda" menu button. Shows ALL future
// bookings; rows whose class starts inside the cancel cutoff (see
// CANCEL_CUTOFF_MS in src/lib/yogo/signups.ts) are flagged with a ⏰ prefix
// and a `_locked` row-id suffix so the click handler can refuse politely
// instead of attempting a Yogo DELETE.
//
// Caller passes a `cancellable` flag per signup (typically derived from
// `isCancellable(signup, now)` in src/lib/yogo/signups.ts) — the renderer
// stays pure and side-effect free.
export interface AgendaItem extends SignupLite {
  cancellable: boolean;
}

export function renderAgendaList(items: AgendaItem[], _now: Date = new Date()): WaListPayload | WaTextPayload {
  // _now is reserved for future relative-time labels (e.g. "em 2h 15min")
  if (items.length === 0) {
    return { type: "text", body: "Não tens aulas marcadas." };
  }
  if (items.length > MAX_TOTAL_ROWS) {
    return {
      type: "text",
      body: "Tens muitas marcações. Escreve a data e hora (DD/MM HH:MM) da aula a cancelar.",
    };
  }
  const rows = items.map((item) => {
    const baseTitle = `${item.klass.start_time} ${item.klass.class_type?.name ?? "Aula"}`;
    if (item.cancellable) {
      return {
        id: String(item.id),
        title: truncate(baseTitle, MAX_ROW_TITLE),
        description: truncate(item.klass.date, MAX_ROW_DESC),
      };
    }
    return {
      id: `${item.id}_locked`,
      title: truncate(`⏰ ${baseTitle}`, MAX_ROW_TITLE),
      description: "em breve · não cancelável",
    };
  });
  return {
    type: "list",
    bodyText: "As tuas próximas aulas:",
    buttonText: "Ver marcações",
    sections: [{ title: "PRÓXIMAS", rows }],
  };
}

export function renderConfirmCancel(signup: SignupLite): WaButtonPayload {
  const name = signup.klass.class_type?.name ?? "Aula";
  return {
    type: "button",
    bodyText: truncate(`Cancelar ${name} · ${signup.klass.date} ${signup.klass.start_time}?`, 1024),
    buttons: [
      { id: "confirm_cancel", title: "Sim, cancelar" },
      { id: "abort_cancel", title: "Não" },
    ],
  };
}

// Top-of-funnel menu. WhatsApp button payload caps title at 20c and supports
// max 3 buttons — both honoured here.
export function renderMenu(): WaButtonPayload {
  return {
    type: "button",
    bodyText: "Olá! O que precisas?",
    buttons: [
      { id: "btn_reservar", title: "Reservar" },
      { id: "btn_agenda", title: "Minha agenda" },
      { id: "btn_outros", title: "Outros" },
    ],
  };
}

// "Outros" sub-menu: lets the student pick between Playlist and Contacto.
// WhatsApp caps button titles at 20c (honoured) and max 3 buttons (2 used).
// Sub-menu for "Outros". A list (not buttons) so we can offer more than 3
// options — WhatsApp button messages cap at 3, lists allow up to 10 rows.
export function renderOutrosMenu(): WaListPayload {
  return {
    type: "list",
    bodyText: "O que precisas?",
    buttonText: "Ver opções",
    sections: [
      {
        title: "Opções",
        rows: [
          { id: "btn_playlist", title: "Playlist da aula" },
          { id: "btn_strikelab_me", title: "🏆 Os Meus Pontos", description: "A tua evolução StrikeLab" },
          { id: "btn_contacto", title: "Contacto" },
          { id: "btn_voltar_menu", title: "Voltar" },
        ],
      },
    ],
  };
}

// Song-request offer (right after a booking is confirmed). Replaces the
// old free-text "Manda o link..." prompt with explicit buttons so the
// student always has a Voltar escape and never has to type "não".
export function renderSongOffer(): WaButtonPayload {
  return {
    type: "button",
    bodyText: "Queres pedir uma música para esta aula?",
    buttons: [
      { id: "song_yes", title: "Sim, pedir" },
      { id: "song_no", title: "Não" },
      { id: "btn_voltar_menu", title: "Voltar" },
    ],
  };
}

// After the student sends a Spotify link, we evaluate the track and show
// a preview with confirm/cancel buttons + Voltar.
export function renderSongConfirm(trackName: string, artistName: string): WaButtonPayload {
  return {
    type: "button",
    bodyText: truncate(`Vais ouvir *${trackName}* — ${artistName} 🎵\nConfirmar?`, 1024),
    buttons: [
      { id: "song_confirm", title: "Confirmar" },
      { id: "song_cancel", title: "Cancelar" },
      { id: "btn_voltar_menu", title: "Menu" },
    ],
  };
}

// When the student already has an active song for this class and sends a
// new link, ask if they want to cancel the previous and replace it.
export function renderReplaceConfirm(
  oldTrack: string,
  oldArtist: string,
  newTrack: string,
  newArtist: string,
): WaButtonPayload {
  return {
    type: "button",
    bodyText: truncate(
      `Já pediste "${oldTrack} — ${oldArtist}".\nCancelar e pedir esta nova (${newTrack} — ${newArtist})?`,
      1024,
    ),
    buttons: [
      { id: "replace_yes", title: "Sim, trocar" },
      { id: "replace_no", title: "Manter anterior" },
      { id: "btn_voltar_menu", title: "Menu" },
    ],
  };
}

// Sent when the bot is mid-flow (e.g. AWAIT_SONG_INPUT) and the user
// sends a button reply from a stale menu, or anything else the flow
// can't act on. Always offers a Voltar escape.
export function renderFlowHint(bodyText: string, retryButtonId: string, retryTitle: string): WaButtonPayload {
  return {
    type: "button",
    bodyText: truncate(bodyText, 1024),
    buttons: [
      { id: retryButtonId, title: retryTitle.slice(0, 20) },
      { id: "btn_voltar_menu", title: "Voltar ao menu" },
    ],
  };
}

function toRow(klass: YogoClassLite): WaListRow {
  const name = klass.class_type?.name ?? "Aula";
  const title = truncate(`${klass.start_time} ${name}`, MAX_ROW_TITLE);
  const seatsLeft =
    typeof klass.seats === "number" && typeof klass.signup_count === "number"
      ? klass.seats - klass.signup_count
      : null;
  const description = seatsLeft !== null ? truncate(`${seatsLeft} lugares`, MAX_ROW_DESC) : undefined;
  return { id: String(klass.id), title, description };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
