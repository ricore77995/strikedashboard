import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  sendTextMock,
  sendButtonMock,
  sendListMock,
  findCustomerByPhoneMock,
  listFutureSignupsMock,
  deleteSignupMock,
  isCancellableMock,
  parseClassStartMock,
  transitionMock,
  resetToIdleMock,
  ttlFromNowMock,
  endInteractionMock,
  sendMenuMock,
  removeSongOnCancelMock,
  parseDateTimeMock,
  waEventCreateMock,
} = vi.hoisted(() => ({
  sendTextMock: vi.fn(),
  sendButtonMock: vi.fn(),
  sendListMock: vi.fn(),
  findCustomerByPhoneMock: vi.fn(),
  listFutureSignupsMock: vi.fn(),
  deleteSignupMock: vi.fn(),
  isCancellableMock: vi.fn(),
  parseClassStartMock: vi.fn(),
  transitionMock: vi.fn(),
  resetToIdleMock: vi.fn(),
  ttlFromNowMock: vi.fn(),
  endInteractionMock: vi.fn(),
  sendMenuMock: vi.fn(),
  removeSongOnCancelMock: vi.fn(),
  parseDateTimeMock: vi.fn(),
  waEventCreateMock: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  return {
    db: {
      waEvent: {
        create: waEventCreateMock,
      },
    },
  };
});

vi.mock("@/lib/wa/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wa/meta")>();
  return {
    ...actual,
    sendText: sendTextMock,
    sendButton: sendButtonMock,
    sendList: sendListMock,
  };
});

vi.mock("@/lib/yogo/lookup", () => ({
  findCustomerByPhone: findCustomerByPhoneMock,
}));

vi.mock("@/lib/yogo/signups", () => ({
  listFutureSignups: listFutureSignupsMock,
  deleteSignup: deleteSignupMock,
  isCancellable: isCancellableMock,
  parseClassStart: parseClassStartMock,
}));

vi.mock("@/lib/wa/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wa/session")>();
  return {
    ...actual,
    transition: transitionMock,
    resetToIdle: resetToIdleMock,
    ttlFromNow: ttlFromNowMock,
  };
});

vi.mock("@/lib/wa/handlers/menu", () => ({
  endInteraction: endInteractionMock,
  sendMenu: sendMenuMock,
}));

vi.mock("@/lib/wa/handlers/song-request", () => ({
  removeSongOnCancel: removeSongOnCancelMock,
}));

vi.mock("@/lib/wa/parser", () => ({
  parseDateTime: parseDateTimeMock,
}));

// Must import AFTER vi.mock calls
import {
  handleCancelar,
  handleCancelPick,
  handleCancelPickByText,
  handleConfirmCancel,
  handleAbortCancel,
} from "@/lib/wa/handlers/cancelar";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PHONE = "+351912345678";
const FAKE_EXPIRES = new Date(Date.now() + 600_000);

const BASE_SESSION = {
  phoneE164: PHONE,
  state: "IDLE",
  pendingClassId: null,
  pendingSignupId: null,
  pendingSongClassId: null,
  pendingTrackId: null,
  expiresAt: null,
  version: 0,
};

const CUSTOMER = { id: 100, first_name: "Ricardo" };

/** Build a YogoSignup-like object with a nested class object. */
function makeSignup(
  id: number,
  classId: number,
  extra: { date?: string; start_time?: string; cancelled_at?: number | null } = {},
) {
  return {
    id,
    user_id: 100,
    class: {
      id: classId,
      date: extra.date ?? "2026-06-15",
      start_time: extra.start_time ?? "19:30",
      class_type: { id: 1, name: "Muay Thai" },
    },
    cancelled_at: extra.cancelled_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Default mock resolutions (overridden per-test as needed)
// ---------------------------------------------------------------------------

function defaultMetaMocks() {
  sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
  sendButtonMock.mockResolvedValue({ ok: true, status: 200, body: "" });
  sendListMock.mockResolvedValue({ ok: true, status: 200, body: "" });
}

function defaultSessionMocks() {
  ttlFromNowMock.mockReturnValue(FAKE_EXPIRES);
  transitionMock.mockResolvedValue({ ok: true, session: { ...BASE_SESSION, version: 1 } });
  resetToIdleMock.mockResolvedValue({ ok: true, session: { ...BASE_SESSION, state: "IDLE" } });
}

function defaultDbMocks() {
  waEventCreateMock.mockResolvedValue({});
}

// ---------------------------------------------------------------------------
// handleCancelar
// ---------------------------------------------------------------------------

describe("handleCancelar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultMetaMocks();
    defaultSessionMocks();
    defaultDbMocks();
  });

  it("lookup miss → sends NO_PLAN_LOOKUP + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(null);

    await handleCancelar(BASE_SESSION);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "LOOKUP_MISS", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("Marcelo"));
    expect(endInteractionMock).toHaveBeenCalledWith(BASE_SESSION, PHONE);
  });

  it("no signups → sends NO_SIGNUPS + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([]);

    await handleCancelar(BASE_SESSION);

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("Não tens aulas marcadas"));
    expect(endInteractionMock).toHaveBeenCalledWith(BASE_SESSION, PHONE);
  });

  it("all locked (inside 2h cutoff) → sends cutoff message + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    const s1 = makeSignup(101, 201);
    const s2 = makeSignup(102, 202);
    listFutureSignupsMock.mockResolvedValueOnce([s1, s2]);
    // Both non-cancellable (inside cutoff)
    isCancellableMock.mockReturnValue(false);

    await handleCancelar(BASE_SESSION);

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("Não tens aulas canceláveis"),
    );
    expect(endInteractionMock).toHaveBeenCalledWith(BASE_SESSION, PHONE);
  });

  it("N=1 cancellable, 0 locked → fast-path to AWAIT_CONFIRM_CANCEL + sendButton", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    const s1 = makeSignup(101, 201);
    listFutureSignupsMock.mockResolvedValueOnce([s1]);
    isCancellableMock.mockReturnValue(true);

    await handleCancelar(BASE_SESSION);

    expect(transitionMock).toHaveBeenCalledWith(BASE_SESSION, {
      state: "AWAIT_CONFIRM_CANCEL",
      pendingSignupId: 101,
      expiresAt: FAKE_EXPIRES,
    });
    expect(sendButtonMock).toHaveBeenCalledTimes(1);
    expect(sendButtonMock.mock.calls[0][0]).toBe(PHONE);
    const payload = sendButtonMock.mock.calls[0][1];
    expect(payload.type).toBe("button");
    expect(payload.bodyText).toContain("Cancelar");
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("N=2..10 mixed → sends interactive list (sendList)", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    const signups = [makeSignup(101, 201), makeSignup(102, 202), makeSignup(103, 203)];
    listFutureSignupsMock.mockResolvedValueOnce(signups);
    // Mix: first two cancellable, third locked
    isCancellableMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    await handleCancelar(BASE_SESSION);

    expect(transitionMock).toHaveBeenCalledWith(BASE_SESSION, {
      state: "AWAIT_CANCEL_PICK",
      pendingSignupId: null,
      expiresAt: FAKE_EXPIRES,
    });
    expect(sendListMock).toHaveBeenCalledTimes(1);
    expect(sendListMock.mock.calls[0][0]).toBe(PHONE);
    const payload = sendListMock.mock.calls[0][1];
    expect(payload.type).toBe("list");
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("N>10 → sends free-text instruction (sendText, not sendList)", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    // 11 signups → exceeds MAX_TOTAL_ROWS (10) so renderAgendaList returns text
    const signups = Array.from({ length: 11 }, (_, i) => makeSignup(100 + i, 200 + i));
    listFutureSignupsMock.mockResolvedValueOnce(signups);
    isCancellableMock.mockReturnValue(true);

    await handleCancelar(BASE_SESSION);

    expect(transitionMock).toHaveBeenCalledWith(BASE_SESSION, {
      state: "AWAIT_CANCEL_PICK",
      pendingSignupId: null,
      expiresAt: FAKE_EXPIRES,
    });
    expect(sendTextMock).toHaveBeenCalledTimes(1);
    expect(sendTextMock.mock.calls[0][1]).toContain("data e hora");
    expect(sendListMock).not.toHaveBeenCalled();
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("transition race → logs SESSION_RACE, no message sent", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    const s1 = makeSignup(101, 201);
    listFutureSignupsMock.mockResolvedValueOnce([s1]);
    isCancellableMock.mockReturnValue(true);
    transitionMock.mockResolvedValueOnce({ ok: false, reason: "race" });

    await handleCancelar(BASE_SESSION);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "SESSION_RACE", phoneE164: PHONE },
    });
    expect(sendButtonMock).not.toHaveBeenCalled();
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleCancelPick
// ---------------------------------------------------------------------------

describe("handleCancelPick", () => {
  const PICK_SESSION = { ...BASE_SESSION, state: "AWAIT_CANCEL_PICK" as const, version: 1 };

  beforeEach(() => {
    vi.resetAllMocks();
    defaultMetaMocks();
    defaultSessionMocks();
    defaultDbMocks();
  });

  it("_locked suffix → sends locked message, stays in AWAIT_CANCEL_PICK (no transition)", async () => {
    await handleCancelPick(PICK_SESSION, "101_locked");

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("menos de 2h"));
    expect(transitionMock).not.toHaveBeenCalled();
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("invalid (non-numeric) id → sends invalid selection message", async () => {
    await handleCancelPick(PICK_SESSION, "abc");

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("Selecção inválida"));
    expect(transitionMock).not.toHaveBeenCalled();
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("lookup miss → sends NO_PLAN_LOOKUP + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(null);

    await handleCancelPick(PICK_SESSION, "101");

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "LOOKUP_MISS", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("Marcelo"));
    expect(endInteractionMock).toHaveBeenCalledWith(PICK_SESSION, PHONE);
  });

  it("signup not found or not cancellable → sends ERR_NOT_FOUND + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([]);
    isCancellableMock.mockReturnValue(false);

    await handleCancelPick(PICK_SESSION, "999");

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("já não está disponível"));
    expect(endInteractionMock).toHaveBeenCalledWith(PICK_SESSION, PHONE);
  });

  it("valid pick → transitions to AWAIT_CONFIRM_CANCEL + sends confirm button", async () => {
    const s1 = makeSignup(101, 201, { date: "2026-06-15", start_time: "19:30" });
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([s1]);
    isCancellableMock.mockReturnValue(true);

    await handleCancelPick(PICK_SESSION, "101");

    expect(transitionMock).toHaveBeenCalledWith(PICK_SESSION, {
      state: "AWAIT_CONFIRM_CANCEL",
      pendingSignupId: 101,
      expiresAt: FAKE_EXPIRES,
    });
    expect(sendButtonMock).toHaveBeenCalledTimes(1);
    const payload = sendButtonMock.mock.calls[0][1];
    expect(payload.type).toBe("button");
    expect(payload.bodyText).toContain("Cancelar");
    expect(endInteractionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleCancelPickByText
// ---------------------------------------------------------------------------

describe("handleCancelPickByText", () => {
  const PICK_SESSION = { ...BASE_SESSION, state: "AWAIT_CANCEL_PICK" as const, version: 1 };

  beforeEach(() => {
    vi.resetAllMocks();
    defaultMetaMocks();
    defaultSessionMocks();
    defaultDbMocks();
  });

  it("bad format → sends format hint, stays in state (no transition)", async () => {
    parseDateTimeMock.mockReturnValueOnce(null);

    await handleCancelPickByText(PICK_SESSION, "blah blah");

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("Formato inválido"));
    expect(transitionMock).not.toHaveBeenCalled();
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("lookup miss → sends NO_PLAN_LOOKUP + endInteraction", async () => {
    parseDateTimeMock.mockReturnValueOnce({ day: 25, month: 5, hour: 19, minute: 30 });
    findCustomerByPhoneMock.mockResolvedValueOnce(null);

    await handleCancelPickByText(PICK_SESSION, "25/05 19:30");

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "LOOKUP_MISS", phoneE164: PHONE },
    });
    expect(endInteractionMock).toHaveBeenCalledWith(PICK_SESSION, PHONE);
  });

  it("no matching signup → sends no-match message, stays in state", async () => {
    parseDateTimeMock.mockReturnValueOnce({ day: 25, month: 5, hour: 19, minute: 30 });
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([]);
    isCancellableMock.mockReturnValue(false);

    await handleCancelPickByText(PICK_SESSION, "25/05 19:30");

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("Não encontrei"));
    expect(transitionMock).not.toHaveBeenCalled();
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("valid match → transitions to AWAIT_CONFIRM_CANCEL + sends confirm button", async () => {
    const parsed = { day: 15, month: 6, hour: 19, minute: 30 };
    parseDateTimeMock.mockReturnValueOnce(parsed);
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);

    const s1 = makeSignup(101, 201, { date: "2026-06-15", start_time: "19:30" });
    listFutureSignupsMock.mockResolvedValueOnce([s1]);
    isCancellableMock.mockReturnValue(true);
    // parseClassStart returns a Date whose day=15, month=6, hour=19, min=30
    parseClassStartMock.mockReturnValueOnce(new Date(2026, 5, 15, 19, 30)); // month is 0-indexed

    await handleCancelPickByText(PICK_SESSION, "15/06 19:30");

    expect(transitionMock).toHaveBeenCalledWith(PICK_SESSION, {
      state: "AWAIT_CONFIRM_CANCEL",
      pendingSignupId: 101,
      expiresAt: FAKE_EXPIRES,
    });
    expect(sendButtonMock).toHaveBeenCalledTimes(1);
    const payload = sendButtonMock.mock.calls[0][1];
    expect(payload.type).toBe("button");
    expect(payload.bodyText).toContain("Cancelar");
    expect(endInteractionMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleConfirmCancel
// ---------------------------------------------------------------------------

describe("handleConfirmCancel", () => {
  const CONFIRM_SESSION = {
    ...BASE_SESSION,
    state: "AWAIT_CONFIRM_CANCEL" as const,
    pendingSignupId: 101,
    version: 2,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    defaultMetaMocks();
    defaultSessionMocks();
    defaultDbMocks();
  });

  it("no pendingSignupId → sends ERR_RACE + endInteraction", async () => {
    const sessionNoPending = { ...CONFIRM_SESSION, pendingSignupId: null };

    await handleConfirmCancel(sessionNoPending);

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("cruzou-se"));
    expect(endInteractionMock).toHaveBeenCalledWith(sessionNoPending, PHONE);
  });

  it("delete ok → logs CANCEL_OK, sends CANCELLED_OK, removes song", async () => {
    const s1 = makeSignup(101, 201, { date: "2026-06-15", start_time: "19:30" });
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([s1]);
    deleteSignupMock.mockResolvedValueOnce({ kind: "ok" });
    removeSongOnCancelMock.mockResolvedValueOnce(undefined);

    await handleConfirmCancel(CONFIRM_SESSION);

    expect(deleteSignupMock).toHaveBeenCalledWith(101);
    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "CANCEL_OK", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, "Cancelado.");
    expect(removeSongOnCancelMock).toHaveBeenCalledWith(PHONE, 201);
    expect(endInteractionMock).toHaveBeenCalledWith(CONFIRM_SESSION, PHONE);
  });

  it("delete not_found → logs CANCEL_FAIL with subkind, sends ERR_NOT_FOUND", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([]);
    deleteSignupMock.mockResolvedValueOnce({ kind: "not_found" });

    await handleConfirmCancel(CONFIRM_SESSION);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "CANCEL_FAIL",
        phoneE164: PHONE,
        meta: JSON.stringify({ subkind: "not_found" }),
      }),
    });
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("já não está disponível"));
    expect(removeSongOnCancelMock).not.toHaveBeenCalled();
    expect(endInteractionMock).toHaveBeenCalledWith(CONFIRM_SESSION, PHONE);
  });

  it("delete server_error → logs CANCEL_FAIL with status, sends ERR_SERVER", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([]);
    deleteSignupMock.mockResolvedValueOnce({ kind: "server_error", status: 500 });

    await handleConfirmCancel(CONFIRM_SESSION);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "CANCEL_FAIL",
        phoneE164: PHONE,
        meta: JSON.stringify({ status: 500 }),
      }),
    });
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("indisponível"));
    expect(removeSongOnCancelMock).not.toHaveBeenCalled();
    expect(endInteractionMock).toHaveBeenCalledWith(CONFIRM_SESSION, PHONE);
  });

  it("song removal throws but cancel still succeeds", async () => {
    const s1 = makeSignup(101, 201, { date: "2026-06-15", start_time: "19:30" });
    findCustomerByPhoneMock.mockResolvedValueOnce(CUSTOMER);
    listFutureSignupsMock.mockResolvedValueOnce([s1]);
    deleteSignupMock.mockResolvedValueOnce({ kind: "ok" });
    removeSongOnCancelMock.mockRejectedValueOnce(new Error("Spotify down"));

    await handleConfirmCancel(CONFIRM_SESSION);

    expect(deleteSignupMock).toHaveBeenCalledWith(101);
    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "CANCEL_OK", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, "Cancelado.");
    expect(removeSongOnCancelMock).toHaveBeenCalledWith(PHONE, 201);
    // endInteraction still called — cancellation succeeded
    expect(endInteractionMock).toHaveBeenCalledWith(CONFIRM_SESSION, PHONE);
  });

  it("customer lookup fails (pre-delete) → song removal skipped, cancel still proceeds", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(null);
    deleteSignupMock.mockResolvedValueOnce({ kind: "ok" });

    await handleConfirmCancel(CONFIRM_SESSION);

    expect(deleteSignupMock).toHaveBeenCalledWith(101);
    expect(removeSongOnCancelMock).not.toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith(PHONE, "Cancelado.");
    expect(endInteractionMock).toHaveBeenCalledWith(CONFIRM_SESSION, PHONE);
  });
});

// ---------------------------------------------------------------------------
// handleAbortCancel
// ---------------------------------------------------------------------------

describe("handleAbortCancel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    defaultMetaMocks();
    defaultSessionMocks();
    defaultDbMocks();
  });

  it("sends abort message + endInteraction", async () => {
    await handleAbortCancel(BASE_SESSION);

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("mantenho"));
    expect(endInteractionMock).toHaveBeenCalledWith(BASE_SESSION, PHONE);
  });
});
