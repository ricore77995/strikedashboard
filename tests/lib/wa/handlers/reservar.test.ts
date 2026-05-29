import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  sendTextMock,
  sendListMock,
  sendButtonMock,
  waEventCreateMock,
  findCustomerByPhoneMock,
  listClassesMock,
  bookableForMock,
  createSignupMock,
  transitionMock,
  resetToIdleMock,
  ttlFromNowMock,
  endInteractionMock,
  sendMenuMock,
  offerSongRequestMock,
  renderClassListMock,
  renderConfirmBookMock,
} = vi.hoisted(() => ({
  sendTextMock: vi.fn(),
  sendListMock: vi.fn(),
  sendButtonMock: vi.fn(),
  waEventCreateMock: vi.fn(),
  findCustomerByPhoneMock: vi.fn(),
  listClassesMock: vi.fn(),
  bookableForMock: vi.fn(),
  createSignupMock: vi.fn(),
  transitionMock: vi.fn(),
  resetToIdleMock: vi.fn(),
  ttlFromNowMock: vi.fn(),
  endInteractionMock: vi.fn(),
  sendMenuMock: vi.fn(),
  offerSongRequestMock: vi.fn(),
  renderClassListMock: vi.fn(),
  renderConfirmBookMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    waEvent: {
      create: waEventCreateMock,
    },
  },
}));

vi.mock("@/lib/wa/meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wa/meta")>();
  return {
    ...actual,
    sendText: sendTextMock,
    sendList: sendListMock,
    sendButton: sendButtonMock,
  };
});

vi.mock("@/lib/yogo/lookup", () => ({
  findCustomerByPhone: findCustomerByPhoneMock,
}));

vi.mock("@/lib/yogo/signups", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/yogo/signups")>();
  return {
    ...actual,
    listClasses: listClassesMock,
    bookableFor: bookableForMock,
    createSignup: createSignupMock,
  };
});

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
  handleOutros: vi.fn(),
  handleContacto: vi.fn(),
}));

vi.mock("@/lib/wa/handlers/song-request", () => ({
  offerSongRequest: offerSongRequestMock,
}));

vi.mock("@/lib/wa/render", () => ({
  renderClassList: renderClassListMock,
  renderConfirmBook: renderConfirmBookMock,
}));

import {
  handleReservar,
  handleClassPick,
  handleConfirmBook,
  handleCancelBook,
} from "@/lib/wa/handlers/reservar";

const PHONE = "+351912345678";
const CUSTOMER_ID = 123;
const CLASS_ID = 42;
const FAKE_EXPIRES = new Date(Date.now() + 600_000);

const FAKE_SESSION: import("@/lib/wa/session").SessionRow = {
  phoneE164: PHONE,
  state: "IDLE",
  pendingClassId: null,
  pendingSignupId: null,
  pendingSongClassId: null,
  pendingTrackId: null,
  expiresAt: null,
  version: 0,
};

const FAKE_CUSTOMER = { id: CUSTOMER_ID, first_name: "Ricardo" };

const FAKE_CLASS = {
  id: CLASS_ID,
  date: "2026-05-29",
  start_time: "19:30",
  class_type: { name: "Muay Thai" },
  signup_count: 5,
  seats: 15,
};

// ---------------------------------------------------------------------------
// handleReservar
// ---------------------------------------------------------------------------
describe("handleReservar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
    sendListMock.mockResolvedValue({ ok: true, status: 200, body: "" });
    waEventCreateMock.mockResolvedValue({});
    ttlFromNowMock.mockReturnValue(FAKE_EXPIRES);
    transitionMock.mockResolvedValue({ ok: true, session: { ...FAKE_SESSION, state: "AWAIT_CLASS_PICK", version: 1 } });
  });

  it("lookup miss → logs LOOKUP_MISS + sends fallback text + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(null);

    await handleReservar(FAKE_SESSION);

    expect(findCustomerByPhoneMock).toHaveBeenCalledWith(PHONE);
    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "LOOKUP_MISS", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Não te encontrámos no sistema. Escreve directamente ao Marcelo.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(FAKE_SESSION, PHONE);
    // Should NOT proceed to class listing
    expect(listClassesMock).not.toHaveBeenCalled();
  });

  it("no bookable classes → renderClassList returns text with 0 bookable → sends NO_BOOKABLE + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    listClassesMock.mockResolvedValueOnce([]);
    // bookableFor is never called when all is empty, but renderClassList gets []
    renderClassListMock.mockReturnValueOnce({ type: "text", body: "Sem aulas disponíveis." });

    await handleReservar(FAKE_SESSION);

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Sem aulas disponíveis para reservar nas próximas 48h.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(FAKE_SESSION, PHONE);
    expect(transitionMock).not.toHaveBeenCalled();
    expect(sendListMock).not.toHaveBeenCalled();
  });

  it("renderClassList returns text type (overflow) → sends payload.body + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    listClassesMock.mockResolvedValueOnce([FAKE_CLASS]);
    bookableForMock.mockReturnValueOnce(true);
    renderClassListMock.mockReturnValueOnce({
      type: "text",
      body: "Hoje temos 15 aulas. Escreve a hora (ex: 19:30) para reservar directamente.",
    });

    await handleReservar(FAKE_SESSION);

    // When bookable.length > 0 but payload.type === "text", it sends payload.body (not NO_BOOKABLE)
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Hoje temos 15 aulas. Escreve a hora (ex: 19:30) para reservar directamente.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(FAKE_SESSION, PHONE);
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it("bookable classes available → transitions to AWAIT_CLASS_PICK + sends list", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    listClassesMock.mockResolvedValueOnce([FAKE_CLASS]);
    bookableForMock.mockReturnValueOnce(true);
    const listPayload = {
      type: "list" as const,
      bodyText: "Escolhe a aula para reservar:",
      buttonText: "Ver aulas",
      sections: [{ title: "HOJE", rows: [{ id: String(CLASS_ID), title: "19:30 Muay Thai" }] }],
    };
    renderClassListMock.mockReturnValueOnce(listPayload);

    await handleReservar(FAKE_SESSION);

    expect(transitionMock).toHaveBeenCalledWith(FAKE_SESSION, {
      state: "AWAIT_CLASS_PICK",
      pendingClassId: null,
      expiresAt: FAKE_EXPIRES,
    });
    expect(sendListMock).toHaveBeenCalledWith(PHONE, listPayload);
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("transition race → logs SESSION_RACE, no list sent", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    listClassesMock.mockResolvedValueOnce([FAKE_CLASS]);
    bookableForMock.mockReturnValueOnce(true);
    renderClassListMock.mockReturnValueOnce({
      type: "list",
      bodyText: "Escolhe:",
      buttonText: "Ver",
      sections: [],
    });
    transitionMock.mockResolvedValueOnce({ ok: false, reason: "race" });

    await handleReservar(FAKE_SESSION);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "SESSION_RACE", phoneE164: PHONE },
    });
    expect(sendListMock).not.toHaveBeenCalled();
  });

  it("sendList fails → logs SEND_FAIL with meta details", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    listClassesMock.mockResolvedValueOnce([FAKE_CLASS]);
    bookableForMock.mockReturnValueOnce(true);
    const listPayload = {
      type: "list" as const,
      bodyText: "Escolhe:",
      buttonText: "Ver",
      sections: [{ title: "HOJE", rows: [{ id: String(CLASS_ID), title: "19:30 Muay Thai" }] }],
    };
    renderClassListMock.mockReturnValueOnce(listPayload);
    sendListMock.mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });

    await handleReservar(FAKE_SESSION);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "SEND_FAIL",
        phoneE164: PHONE,
      }),
    });
    // Verify the meta JSON includes where, status, sectionCount, rowCount
    const metaArg = waEventCreateMock.mock.calls[0][0].data;
    const meta = JSON.parse(metaArg.meta as string);
    expect(meta.where).toBe("handleReservar.sendList");
    expect(meta.status).toBe(500);
    expect(meta.sectionCount).toBe(1);
    expect(meta.rowCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// handleClassPick
// ---------------------------------------------------------------------------
describe("handleClassPick", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
    sendButtonMock.mockResolvedValue({ ok: true, status: 200, body: "" });
    waEventCreateMock.mockResolvedValue({});
    ttlFromNowMock.mockReturnValue(FAKE_EXPIRES);
    transitionMock.mockResolvedValue({
      ok: true,
      session: { ...FAKE_SESSION, state: "AWAIT_CONFIRM_BOOK", pendingClassId: CLASS_ID, version: 1 },
    });
    renderConfirmBookMock.mockReturnValue({
      type: "button",
      bodyText: "Confirmas? Muay Thai · 19:30",
      buttons: [
        { id: "confirm_book", title: "Sim, reservar" },
        { id: "cancel_book", title: "Cancelar" },
      ],
    });
  });

  it("non-numeric classId → sends invalid selection text, no transition", async () => {
    const session: import("@/lib/wa/session").SessionRow = {
      ...FAKE_SESSION,
      state: "AWAIT_CLASS_PICK",
    };

    await handleClassPick(session, "abc");

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Selecção inválida. Diz reserva para começar de novo.",
    );
    expect(listClassesMock).not.toHaveBeenCalled();
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it("Infinity classId → sends invalid selection text (non-finite number)", async () => {
    const session: import("@/lib/wa/session").SessionRow = {
      ...FAKE_SESSION,
      state: "AWAIT_CLASS_PICK",
    };

    await handleClassPick(session, "Infinity");

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Selecção inválida. Diz reserva para começar de novo.",
    );
    expect(listClassesMock).not.toHaveBeenCalled();
  });

  it("class no longer in list → sends gone text + endInteraction", async () => {
    const session: import("@/lib/wa/session").SessionRow = {
      ...FAKE_SESSION,
      state: "AWAIT_CLASS_PICK",
    };
    listClassesMock.mockResolvedValueOnce([]); // No classes returned

    await handleClassPick(session, String(CLASS_ID));

    expect(listClassesMock).toHaveBeenCalled();
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Aula já não está disponível. Diz reserva para ver as actuais.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(session, PHONE);
    expect(transitionMock).not.toHaveBeenCalled();
  });

  it("valid class pick → transitions to AWAIT_CONFIRM_BOOK + sends button", async () => {
    const session: import("@/lib/wa/session").SessionRow = {
      ...FAKE_SESSION,
      state: "AWAIT_CLASS_PICK",
    };
    listClassesMock.mockResolvedValueOnce([FAKE_CLASS]);
    const buttonPayload = {
      type: "button" as const,
      bodyText: "Confirmas? Muay Thai · 19:30",
      buttons: [
        { id: "confirm_book", title: "Sim, reservar" },
        { id: "cancel_book", title: "Cancelar" },
      ],
    };
    renderConfirmBookMock.mockReturnValueOnce(buttonPayload);

    await handleClassPick(session, String(CLASS_ID));

    expect(transitionMock).toHaveBeenCalledWith(session, {
      state: "AWAIT_CONFIRM_BOOK",
      pendingClassId: CLASS_ID,
      expiresAt: FAKE_EXPIRES,
    });
    expect(renderConfirmBookMock).toHaveBeenCalledWith(FAKE_CLASS);
    expect(sendButtonMock).toHaveBeenCalledWith(PHONE, buttonPayload);
    expect(endInteractionMock).not.toHaveBeenCalled();
  });

  it("transition race → logs SESSION_RACE, no button sent", async () => {
    const session: import("@/lib/wa/session").SessionRow = {
      ...FAKE_SESSION,
      state: "AWAIT_CLASS_PICK",
    };
    listClassesMock.mockResolvedValueOnce([FAKE_CLASS]);
    transitionMock.mockResolvedValueOnce({ ok: false, reason: "race" });

    await handleClassPick(session, String(CLASS_ID));

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "SESSION_RACE", phoneE164: PHONE },
    });
    expect(sendButtonMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleConfirmBook
// ---------------------------------------------------------------------------
describe("handleConfirmBook", () => {
  const confirmSession: import("@/lib/wa/session").SessionRow = {
    phoneE164: PHONE,
    state: "AWAIT_CONFIRM_BOOK",
    pendingClassId: CLASS_ID,
    pendingSignupId: null,
    pendingSongClassId: null,
    pendingTrackId: null,
    expiresAt: FAKE_EXPIRES,
    version: 2,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
    waEventCreateMock.mockResolvedValue({});
  });

  it("no pendingClassId → sends ERR_RACE + endInteraction", async () => {
    const sessionNoClass = { ...confirmSession, pendingClassId: null };

    await handleConfirmBook(sessionNoClass);

    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Outra mensagem cruzou-se com esta. Diz reserva para começar de novo.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(sessionNoClass, PHONE);
    expect(findCustomerByPhoneMock).not.toHaveBeenCalled();
  });

  it("lookup miss → logs LOOKUP_MISS + sends fallback + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(null);

    await handleConfirmBook(confirmSession);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "LOOKUP_MISS", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Não te encontrámos no sistema. Escreve directamente ao Marcelo.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(confirmSession, PHONE);
    expect(createSignupMock).not.toHaveBeenCalled();
  });

  it("createSignup ok → logs BOOKING_OK + sends booked text + offerSongRequest + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    createSignupMock.mockResolvedValueOnce({ kind: "ok" });
    offerSongRequestMock.mockResolvedValueOnce(undefined);

    await handleConfirmBook(confirmSession);

    expect(createSignupMock).toHaveBeenCalledWith(CUSTOMER_ID, CLASS_ID);
    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "BOOKING_OK", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Reservado. Aparece 10min antes.",
    );
    expect(offerSongRequestMock).toHaveBeenCalledWith(PHONE, CLASS_ID);
    expect(endInteractionMock).toHaveBeenCalledWith(confirmSession, PHONE);
  });

  it("createSignup already_booked → logs BOOKING_OK with subkind + sends already text + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    createSignupMock.mockResolvedValueOnce({ kind: "already_booked" });

    await handleConfirmBook(confirmSession);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "BOOKING_OK",
        phoneE164: PHONE,
        meta: JSON.stringify({ subkind: "already_booked" }),
      },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Já estás inscrito nesta aula.",
    );
    expect(offerSongRequestMock).not.toHaveBeenCalled();
    expect(endInteractionMock).toHaveBeenCalledWith(confirmSession, PHONE);
  });

  it("createSignup no_plan → logs BOOKING_FAIL no_plan + sends no plan text + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    createSignupMock.mockResolvedValueOnce({ kind: "no_plan" });

    await handleConfirmBook(confirmSession);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "BOOKING_FAIL",
        phoneE164: PHONE,
        meta: JSON.stringify({ subkind: "no_plan" }),
      },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Sem plano activo. Fala com o Marcelo.",
    );
    expect(offerSongRequestMock).not.toHaveBeenCalled();
    expect(endInteractionMock).toHaveBeenCalledWith(confirmSession, PHONE);
  });

  it("createSignup server_error → logs BOOKING_FAIL with status + sends server error text + endInteraction", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    createSignupMock.mockResolvedValueOnce({ kind: "server_error", status: 500 });

    await handleConfirmBook(confirmSession);

    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: {
        kind: "BOOKING_FAIL",
        phoneE164: PHONE,
        meta: JSON.stringify({ status: 500 }),
      },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Sistema temporariamente indisponível. Tenta outra vez em 1min.",
    );
    expect(offerSongRequestMock).not.toHaveBeenCalled();
    expect(endInteractionMock).toHaveBeenCalledWith(confirmSession, PHONE);
  });

  it("offerSongRequest throws but booking succeeds — catch swallows the error", async () => {
    findCustomerByPhoneMock.mockResolvedValueOnce(FAKE_CUSTOMER);
    createSignupMock.mockResolvedValueOnce({ kind: "ok" });
    offerSongRequestMock.mockRejectedValueOnce(new Error("Song offer exploded"));

    // Must NOT throw
    await expect(handleConfirmBook(confirmSession)).resolves.toBeUndefined();

    // Booking still succeeded
    expect(waEventCreateMock).toHaveBeenCalledWith({
      data: { kind: "BOOKING_OK", phoneE164: PHONE },
    });
    expect(sendTextMock).toHaveBeenCalledWith(
      PHONE,
      "Reservado. Aparece 10min antes.",
    );
    expect(endInteractionMock).toHaveBeenCalledWith(confirmSession, PHONE);
  });
});

// ---------------------------------------------------------------------------
// handleCancelBook
// ---------------------------------------------------------------------------
describe("handleCancelBook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sendTextMock.mockResolvedValue({ ok: true, status: 200, body: "" });
  });

  it("sends cancel text + endInteraction", async () => {
    const session: import("@/lib/wa/session").SessionRow = {
      ...FAKE_SESSION,
      state: "AWAIT_CONFIRM_BOOK",
      pendingClassId: CLASS_ID,
    };

    await handleCancelBook(session);

    expect(sendTextMock).toHaveBeenCalledWith(PHONE, "Ok, reserva cancelada.");
    expect(endInteractionMock).toHaveBeenCalledWith(session, PHONE);
  });

  it("does not call createSignup or offerSongRequest", async () => {
    await handleCancelBook(FAKE_SESSION);

    expect(createSignupMock).not.toHaveBeenCalled();
    expect(offerSongRequestMock).not.toHaveBeenCalled();
  });
});
