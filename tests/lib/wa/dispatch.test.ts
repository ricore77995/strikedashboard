import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// hoisted mock functions — every handler is a bare vi.fn() because this file
// only asserts *which* handler was called with *what* args, not what it does.
// ---------------------------------------------------------------------------
const {
  isReservarEnabledMock,
  loadSessionMock,
  isExpiredMock,
  resetToIdleMock,
  sendTextMock,
  sendButtonMock,
  parseIntentMock,
  renderFlowHintMock,
  handleReservarMock,
  handleClassPickMock,
  handleConfirmBookMock,
  handleCancelBookMock,
  handleCancelarMock,
  handleCancelPickMock,
  handleCancelPickByTextMock,
  handleConfirmCancelMock,
  handleAbortCancelMock,
  sendMenuMock,
  endInteractionMock,
  handleContactoMock,
  handleOutrosMock,
  handlePlaylistListMock,
  handleSongInputMock,
  handleSongOfferButtonMock,
  handleSongConfirmMock,
  handleSwapConfirmMock,
  handleStrikelabOnboardMock,
  handleStrikelabParentalMock,
  dbWaEventCreateMock,
} = vi.hoisted(() => ({
  isReservarEnabledMock: vi.fn<() => boolean>().mockReturnValue(true),
  loadSessionMock: vi.fn(),
  isExpiredMock: vi.fn().mockReturnValue(false),
  resetToIdleMock: vi.fn(),
  sendTextMock: vi.fn().mockResolvedValue({ ok: true, status: 200, body: "" }),
  sendButtonMock: vi.fn().mockResolvedValue({ ok: true, status: 200, body: "" }),
  parseIntentMock: vi.fn(),
  renderFlowHintMock: vi.fn().mockReturnValue({ type: "button", bodyText: "hint", buttons: [] }),
  handleReservarMock: vi.fn().mockResolvedValue(undefined),
  handleClassPickMock: vi.fn().mockResolvedValue(undefined),
  handleConfirmBookMock: vi.fn().mockResolvedValue(undefined),
  handleCancelBookMock: vi.fn().mockResolvedValue(undefined),
  handleCancelarMock: vi.fn().mockResolvedValue(undefined),
  handleCancelPickMock: vi.fn().mockResolvedValue(undefined),
  handleCancelPickByTextMock: vi.fn().mockResolvedValue(undefined),
  handleConfirmCancelMock: vi.fn().mockResolvedValue(undefined),
  handleAbortCancelMock: vi.fn().mockResolvedValue(undefined),
  sendMenuMock: vi.fn().mockResolvedValue(undefined),
  endInteractionMock: vi.fn().mockResolvedValue(undefined),
  handleContactoMock: vi.fn().mockResolvedValue(undefined),
  handleOutrosMock: vi.fn().mockResolvedValue(undefined),
  handlePlaylistListMock: vi.fn().mockResolvedValue(undefined),
  handleSongInputMock: vi.fn().mockResolvedValue(undefined),
  handleSongOfferButtonMock: vi.fn().mockResolvedValue(undefined),
  handleSongConfirmMock: vi.fn().mockResolvedValue(undefined),
  handleSwapConfirmMock: vi.fn().mockResolvedValue(undefined),
  handleStrikelabOnboardMock: vi.fn().mockResolvedValue(undefined),
  handleStrikelabParentalMock: vi.fn().mockResolvedValue(undefined),
  dbWaEventCreateMock: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  db: { waEvent: { create: dbWaEventCreateMock } },
}));

vi.mock("@/lib/wa/config", () => ({
  isReservarEnabled: isReservarEnabledMock,
}));

vi.mock("@/lib/wa/session", () => ({
  loadSession: loadSessionMock,
  isExpired: isExpiredMock,
  resetToIdle: resetToIdleMock,
}));

vi.mock("@/lib/wa/meta", () => ({
  sendText: sendTextMock,
  sendButton: sendButtonMock,
}));

vi.mock("@/lib/wa/parser", () => ({
  parseIntent: parseIntentMock,
}));

vi.mock("@/lib/wa/render", () => ({
  renderFlowHint: renderFlowHintMock,
}));

vi.mock("@/lib/wa/handlers/reservar", () => ({
  handleReservar: handleReservarMock,
  handleClassPick: handleClassPickMock,
  handleConfirmBook: handleConfirmBookMock,
  handleCancelBook: handleCancelBookMock,
}));

vi.mock("@/lib/wa/handlers/cancelar", () => ({
  handleCancelar: handleCancelarMock,
  handleCancelPick: handleCancelPickMock,
  handleCancelPickByText: handleCancelPickByTextMock,
  handleConfirmCancel: handleConfirmCancelMock,
  handleAbortCancel: handleAbortCancelMock,
}));

vi.mock("@/lib/wa/handlers/menu", () => ({
  sendMenu: sendMenuMock,
  endInteraction: endInteractionMock,
  handleContacto: handleContactoMock,
  handleOutros: handleOutrosMock,
}));

vi.mock("@/lib/wa/handlers/playlist-list", () => ({
  handlePlaylistList: handlePlaylistListMock,
}));

vi.mock("@/lib/wa/handlers/song-request", () => ({
  handleSongInput: handleSongInputMock,
  handleSongOfferButton: handleSongOfferButtonMock,
  handleSongConfirm: handleSongConfirmMock,
  handleSwapConfirm: handleSwapConfirmMock,
}));

vi.mock("@/lib/wa/handlers/strikelab-onboard", () => ({
  handleStrikelabOnboard: handleStrikelabOnboardMock,
  handleStrikelabParental: handleStrikelabParentalMock,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks are in place
// ---------------------------------------------------------------------------
import { dispatch } from "@/lib/wa/dispatch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PHONE = "+351912345678";

function makeSession(overrides: Partial<{
  state: string;
  pendingClassId: number | null;
  pendingSignupId: number | null;
  pendingSongClassId: number | null;
  pendingTrackId: string | null;
  version: number;
}> = {}) {
  return {
    phoneE164: PHONE,
    state: "IDLE" as string,
    pendingClassId: null as number | null,
    pendingSignupId: null as number | null,
    pendingSongClassId: null as number | null,
    pendingTrackId: null as string | null,
    expiresAt: null as Date | null,
    version: 0,
    ...overrides,
  };
}

function textMsg(body: string) {
  return { type: "text", text: { body } };
}

function buttonMsg(id: string) {
  return {
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id } },
  };
}

function listPickMsg(id: string) {
  return {
    type: "interactive",
    interactive: { type: "list_reply", list_reply: { id } },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  isReservarEnabledMock.mockReturnValue(true);
  isExpiredMock.mockReturnValue(false);
  sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
  sendButtonMock.mockResolvedValue({ ok: true, status: 200, body: "" });
  loadSessionMock.mockResolvedValue(makeSession());
  resetToIdleMock.mockResolvedValue({ ok: true, session: makeSession() });
  parseIntentMock.mockReturnValue({ kind: "text", body: "hello" });
});

describe("dispatch", () => {
  // -----------------------------------------------------------------------
  // Echo mode (reservar disabled)
  // -----------------------------------------------------------------------
  it("echo mode: isReservarEnabled=false sends echo text", async () => {
    isReservarEnabledMock.mockReturnValue(false);
    parseIntentMock.mockReturnValue({ kind: "text", body: "ola" });

    await dispatch(PHONE, textMsg("ola"));

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, "echo: ola");
    expect(loadSessionMock).not.toHaveBeenCalled();
  });

  it("echo mode: empty body sends 'echo: '", async () => {
    isReservarEnabledMock.mockReturnValue(false);
    parseIntentMock.mockReturnValue({ kind: "text", body: "" });

    await dispatch(PHONE, textMsg(""));

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, "echo: ");
  });

  it("echo mode: logs SEND_FAIL on failed send", async () => {
    isReservarEnabledMock.mockReturnValue(false);
    parseIntentMock.mockReturnValue({ kind: "text", body: "ola" });
    sendTextMock.mockResolvedValueOnce({ ok: false, status: 500, body: "fail" });

    await dispatch(PHONE, textMsg("ola"));

    expect(dbWaEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "SEND_FAIL", phoneE164: PHONE }),
    });
  });

  // -----------------------------------------------------------------------
  // btn_voltar_menu — universal escape from any state
  // -----------------------------------------------------------------------
  it("btn_voltar_menu from any state triggers endInteraction", async () => {
    const session = makeSession({ state: "AWAIT_CLASS_PICK" });
    loadSessionMock.mockResolvedValue(session);
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_voltar_menu" });

    await dispatch(PHONE, buttonMsg("btn_voltar_menu"));

    expect(endInteractionMock).toHaveBeenCalledWith(session, PHONE);
  });

  // -----------------------------------------------------------------------
  // IDLE state
  // -----------------------------------------------------------------------
  it("IDLE + text sends menu", async () => {
    loadSessionMock.mockResolvedValue(makeSession({ state: "IDLE" }));
    parseIntentMock.mockReturnValue({ kind: "text", body: "qualquer coisa" });

    await dispatch(PHONE, textMsg("qualquer coisa"));

    expect(sendMenuMock).toHaveBeenCalledWith(PHONE);
  });

  it("IDLE + btn_reservar resets to idle then calls handleReservar", async () => {
    const session = makeSession({ state: "IDLE" });
    const idleSession = makeSession({ state: "IDLE" });
    loadSessionMock.mockResolvedValue(session);
    resetToIdleMock.mockResolvedValue({ ok: true, session: idleSession });
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_reservar" });

    await dispatch(PHONE, buttonMsg("btn_reservar"));

    expect(handleReservarMock).toHaveBeenCalledWith(idleSession);
  });

  it("IDLE + btn_agenda resets to idle then calls handleCancelar", async () => {
    const session = makeSession({ state: "IDLE" });
    const idleSession = makeSession({ state: "IDLE" });
    loadSessionMock.mockResolvedValue(session);
    resetToIdleMock.mockResolvedValue({ ok: true, session: idleSession });
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_agenda" });

    await dispatch(PHONE, buttonMsg("btn_agenda"));

    expect(handleCancelarMock).toHaveBeenCalledWith(idleSession);
  });

  it("IDLE + btn_outros resets to idle then calls handleOutros with phone", async () => {
    const session = makeSession({ state: "IDLE" });
    const idleSession = makeSession({ state: "IDLE" });
    loadSessionMock.mockResolvedValue(session);
    resetToIdleMock.mockResolvedValue({ ok: true, session: idleSession });
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_outros" });

    await dispatch(PHONE, buttonMsg("btn_outros"));

    expect(handleOutrosMock).toHaveBeenCalledWith(PHONE);
  });

  // -----------------------------------------------------------------------
  // Global button intercepts (any state)
  // -----------------------------------------------------------------------
  it("btn_playlist from any state calls handlePlaylistList with phone", async () => {
    loadSessionMock.mockResolvedValue(makeSession({ state: "AWAIT_CLASS_PICK" }));
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_playlist" });

    await dispatch(PHONE, buttonMsg("btn_playlist"));

    expect(handlePlaylistListMock).toHaveBeenCalledWith(PHONE);
  });

  it("btn_contacto from any state calls handleContacto with phone", async () => {
    loadSessionMock.mockResolvedValue(makeSession({ state: "AWAIT_CLASS_PICK" }));
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_contacto" });

    await dispatch(PHONE, buttonMsg("btn_contacto"));

    expect(handleContactoMock).toHaveBeenCalledWith(PHONE);
  });

  // -----------------------------------------------------------------------
  // Expired session
  // -----------------------------------------------------------------------
  it("expired session is reset to idle, then routes as IDLE", async () => {
    const expiredSession = makeSession({ state: "AWAIT_CLASS_PICK" });
    const idleSession = makeSession({ state: "IDLE" });
    isExpiredMock.mockReturnValue(true);
    loadSessionMock.mockResolvedValue(expiredSession);
    resetToIdleMock.mockResolvedValue({ ok: true, session: idleSession });
    parseIntentMock.mockReturnValue({ kind: "text", body: "ola" });

    await dispatch(PHONE, textMsg("ola"));

    expect(resetToIdleMock).toHaveBeenCalledWith(expiredSession);
    // After reset, state is IDLE → sendMenu
    expect(sendMenuMock).toHaveBeenCalledWith(PHONE);
  });

  // -----------------------------------------------------------------------
  // AWAIT_CLASS_PICK
  // -----------------------------------------------------------------------
  describe("AWAIT_CLASS_PICK", () => {
    const session = makeSession({ state: "AWAIT_CLASS_PICK", pendingClassId: 42 });

    it("list_pick calls handleClassPick(session, id)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "list_pick", id: "cls_99" });

      await dispatch(PHONE, listPickMsg("cls_99"));

      expect(handleClassPickMock).toHaveBeenCalledWith(session, "cls_99");
    });

    it("confirm_book calls handleConfirmBook(session)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "confirm_book" });

      await dispatch(PHONE, buttonMsg("confirm_book"));

      expect(handleConfirmBookMock).toHaveBeenCalledWith(session);
    });

    it("cancel_book calls handleCancelBook(session)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "cancel_book" });

      await dispatch(PHONE, buttonMsg("cancel_book"));

      expect(handleCancelBookMock).toHaveBeenCalledWith(session);
    });

    it("text resets to idle and sends menu", async () => {
      loadSessionMock.mockResolvedValue(session);
      resetToIdleMock.mockResolvedValue({ ok: true, session: makeSession() });
      parseIntentMock.mockReturnValue({ kind: "text", body: "blah" });

      await dispatch(PHONE, textMsg("blah"));

      expect(resetToIdleMock).toHaveBeenCalledWith(session);
      expect(sendMenuMock).toHaveBeenCalledWith(PHONE);
    });
  });

  // -----------------------------------------------------------------------
  // AWAIT_CONFIRM_BOOK
  // -----------------------------------------------------------------------
  describe("AWAIT_CONFIRM_BOOK", () => {
    const session = makeSession({ state: "AWAIT_CONFIRM_BOOK", pendingClassId: 42 });

    it("confirm_book calls handleConfirmBook(session)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "confirm_book" });

      await dispatch(PHONE, buttonMsg("confirm_book"));

      expect(handleConfirmBookMock).toHaveBeenCalledWith(session);
    });

    it("cancel_book calls handleCancelBook(session)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "cancel_book" });

      await dispatch(PHONE, buttonMsg("cancel_book"));

      expect(handleCancelBookMock).toHaveBeenCalledWith(session);
    });
  });

  // -----------------------------------------------------------------------
  // AWAIT_CANCEL_PICK
  // -----------------------------------------------------------------------
  describe("AWAIT_CANCEL_PICK", () => {
    const session = makeSession({ state: "AWAIT_CANCEL_PICK" });

    it("list_pick calls handleCancelPick(session, id)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "list_pick", id: "signup_55" });

      await dispatch(PHONE, listPickMsg("signup_55"));

      expect(handleCancelPickMock).toHaveBeenCalledWith(session, "signup_55");
    });

    it("text calls handleCancelPickByText(session, body)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "text", body: "25/05 19:30" });

      await dispatch(PHONE, textMsg("25/05 19:30"));

      expect(handleCancelPickByTextMock).toHaveBeenCalledWith(session, "25/05 19:30");
    });
  });

  // -----------------------------------------------------------------------
  // AWAIT_CONFIRM_CANCEL
  // -----------------------------------------------------------------------
  describe("AWAIT_CONFIRM_CANCEL", () => {
    const session = makeSession({ state: "AWAIT_CONFIRM_CANCEL", pendingSignupId: 77 });

    it("confirm_cancel calls handleConfirmCancel(session)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "confirm_cancel" });

      await dispatch(PHONE, buttonMsg("confirm_cancel"));

      expect(handleConfirmCancelMock).toHaveBeenCalledWith(session);
    });

    it("abort_cancel calls handleAbortCancel(session)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "abort_cancel" });

      await dispatch(PHONE, buttonMsg("abort_cancel"));

      expect(handleAbortCancelMock).toHaveBeenCalledWith(session);
    });
  });

  // -----------------------------------------------------------------------
  // AWAIT_SONG_INPUT
  // -----------------------------------------------------------------------
  describe("AWAIT_SONG_INPUT", () => {
    const session = makeSession({
      state: "AWAIT_SONG_INPUT",
      pendingSongClassId: 42,
    });

    it("button(song_yes) calls handleSongOfferButton(session, 'song_yes')", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "song_yes" });

      await dispatch(PHONE, buttonMsg("song_yes"));

      expect(handleSongOfferButtonMock).toHaveBeenCalledWith(session, "song_yes");
    });

    it("button(song_no) calls handleSongOfferButton(session, 'song_no')", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "song_no" });

      await dispatch(PHONE, buttonMsg("song_no"));

      expect(handleSongOfferButtonMock).toHaveBeenCalledWith(session, "song_no");
    });

    it("text calls handleSongInput(session, body)", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({
        kind: "text",
        body: "https://open.spotify.com/track/abc123",
      });

      await dispatch(PHONE, textMsg("https://open.spotify.com/track/abc123"));

      expect(handleSongInputMock).toHaveBeenCalledWith(
        session,
        "https://open.spotify.com/track/abc123",
      );
    });
  });

  // -----------------------------------------------------------------------
  // AWAIT_SONG_CONFIRM
  // -----------------------------------------------------------------------
  describe("AWAIT_SONG_CONFIRM", () => {
    const session = makeSession({
      state: "AWAIT_SONG_CONFIRM",
      pendingSongClassId: 42,
      pendingTrackId: "trackXYZ",
    });

    it("button(song_confirm) calls handleSongConfirm(session, 'song_confirm')", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "song_confirm" });

      await dispatch(PHONE, buttonMsg("song_confirm"));

      expect(handleSongConfirmMock).toHaveBeenCalledWith(session, "song_confirm");
    });

    it("button(song_cancel) calls handleSongConfirm(session, 'song_cancel')", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "song_cancel" });

      await dispatch(PHONE, buttonMsg("song_cancel"));

      expect(handleSongConfirmMock).toHaveBeenCalledWith(session, "song_cancel");
    });

    it('text "sim" calls handleSongConfirm(session, "song_confirm")', async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "text", body: "sim" });

      await dispatch(PHONE, textMsg("sim"));

      expect(handleSongConfirmMock).toHaveBeenCalledWith(session, "song_confirm");
    });

    it('text "nao" calls handleSongConfirm(session, "song_cancel")', async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "text", body: "nao" });

      await dispatch(PHONE, textMsg("nao"));

      expect(handleSongConfirmMock).toHaveBeenCalledWith(session, "song_cancel");
    });
  });

  // -----------------------------------------------------------------------
  // AWAIT_SWAP_CONFIRM
  // -----------------------------------------------------------------------
  describe("AWAIT_SWAP_CONFIRM", () => {
    const session = makeSession({
      state: "AWAIT_SWAP_CONFIRM",
      pendingSongClassId: 42,
      pendingTrackId: "trackXYZ",
    });

    it("button(replace_yes) calls handleSwapConfirm(session, 'replace_yes')", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "replace_yes" });

      await dispatch(PHONE, buttonMsg("replace_yes"));

      expect(handleSwapConfirmMock).toHaveBeenCalledWith(session, "replace_yes");
    });

    it("button(replace_no) calls handleSwapConfirm(session, 'replace_no')", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "replace_no" });

      await dispatch(PHONE, buttonMsg("replace_no"));

      expect(handleSwapConfirmMock).toHaveBeenCalledWith(session, "replace_no");
    });

    it('text "sim" calls handleSwapConfirm(session, "replace_yes")', async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "text", body: "sim" });

      await dispatch(PHONE, textMsg("sim"));

      expect(handleSwapConfirmMock).toHaveBeenCalledWith(session, "replace_yes");
    });

    it('text "nao" calls handleSwapConfirm(session, "replace_no")', async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "text", body: "nao" });

      await dispatch(PHONE, textMsg("nao"));

      expect(handleSwapConfirmMock).toHaveBeenCalledWith(session, "replace_no");
    });
  });

  // -----------------------------------------------------------------------
  // STRIKELAB states
  // -----------------------------------------------------------------------

  describe("STRIKELAB_AWAIT_PARENTAL", () => {
    const session = makeSession({ state: "STRIKELAB_AWAIT_PARENTAL" });

    it('text "strikelab" calls handleStrikelabOnboard(session)', async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "text", body: "strikelab" });

      await dispatch(PHONE, textMsg("strikelab"));

      expect(handleStrikelabOnboardMock).toHaveBeenCalledWith(session);
    });

    it("button(strikelab_parental_done) calls handleStrikelabParental", async () => {
      loadSessionMock.mockResolvedValue(session);
      parseIntentMock.mockReturnValue({ kind: "button", id: "strikelab_parental_done" });

      await dispatch(PHONE, buttonMsg("strikelab_parental_done"));

      expect(handleStrikelabParentalMock).toHaveBeenCalledWith(session, "strikelab_parental_done");
    });
  });

  // -----------------------------------------------------------------------
  // "strikelab" text trigger from IDLE
  // -----------------------------------------------------------------------
  it('IDLE + text "strikelab" calls handleStrikelabOnboard', async () => {
    loadSessionMock.mockResolvedValue(makeSession({ state: "IDLE" }));
    parseIntentMock.mockReturnValue({ kind: "text", body: "strikelab" });

    await dispatch(PHONE, textMsg("strikelab"));

    expect(handleStrikelabOnboardMock).toHaveBeenCalledWith(
      expect.objectContaining({ state: "IDLE" }),
    );
  });

  // -----------------------------------------------------------------------
  // ensureIdle: resetToIdle fails → dispatch returns without calling handler
  // -----------------------------------------------------------------------
  it("ensureIdle: resetToIdle returns { ok: false } → handler not called", async () => {
    loadSessionMock.mockResolvedValue(makeSession({ state: "AWAIT_CLASS_PICK" }));
    resetToIdleMock.mockResolvedValue({ ok: false, reason: "race" });
    parseIntentMock.mockReturnValue({ kind: "button", id: "btn_reservar" });

    await dispatch(PHONE, buttonMsg("btn_reservar"));

    expect(handleReservarMock).not.toHaveBeenCalled();
    expect(dbWaEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: "SESSION_RACE", phoneE164: PHONE }),
    });
  });
});
