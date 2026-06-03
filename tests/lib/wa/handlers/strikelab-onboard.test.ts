import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";

// Mock Yogo lookup
vi.mock("@/lib/yogo/lookup", () => ({
  findCustomerByPhone: vi.fn(),
  getYogoUserDetail: vi.fn(),
  clearCustomerCache: vi.fn(),
}));

// Mock WA meta (sendText/sendButton)
vi.mock("@/lib/wa/meta", () => ({
  sendText: vi.fn().mockResolvedValue({ ok: true }),
  sendButton: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock yogoFetch to prevent DB URL requirement in transitive imports
vi.mock("@/lib/yogo/fetch", () => ({
  yogoFetch: vi.fn(),
}));

import { handleStrikelabOnboard, handleStrikelabReferral } from "@/lib/wa/handlers/strikelab-onboard";
import { findCustomerByPhone, getYogoUserDetail } from "@/lib/yogo/lookup";
import { sendText } from "@/lib/wa/meta";

const mockedFindCustomer = vi.mocked(findCustomerByPhone);
const mockedGetUserDetail = vi.mocked(getYogoUserDetail);
const mockedSendText = vi.mocked(sendText);

function makeSession(phone: string, state = "IDLE") {
  return {
    phoneE164: phone,
    state,
    pendingClassId: null,
    pendingSignupId: null,
    pendingSongClassId: null,
    pendingTrackId: null,
    expiresAt: null,
    version: 1,
  };
}

const CID_ADULT = 90050;
const CID_MINOR = 90051;
const CID_NO_DOB = 90052;
const CID_YOUNG = 90053;
const CID_INVITER = 90054;
const PHONE_ADULT = "+351911000050";
const PHONE_MINOR = "+351911000051";
const PHONE_NO_DOB = "+351911000052";
const PHONE_YOUNG = "+351911000053";
const PHONE_INVITER = "+351911000054";
const TEST_REFERRAL_CODE = "TESTK9";

async function cleanup() {
  for (const id of [CID_ADULT, CID_MINOR, CID_NO_DOB, CID_YOUNG, CID_INVITER]) {
    await db.referral.deleteMany({ where: { referredCustomerId: id } });
    await db.gamificationEventLog.deleteMany({ where: { customerId: id } });
    await db.gamificationState.deleteMany({ where: { customerId: id } });
    await db.gamificationIdentity.deleteMany({ where: { customerId: id } });
  }
  for (const phone of [PHONE_ADULT, PHONE_MINOR, PHONE_INVITER]) {
    await db.waSession.deleteMany({ where: { phoneE164: phone } });
    await db.waOutbound.deleteMany({ where: { phoneE164: phone } });
    await db.waInbound.deleteMany({ where: { phoneE164: phone } });
    await db.waContact.deleteMany({ where: { phoneE164: phone } });
  }
}

async function seedWaSession(phone: string, version = 1) {
  await db.waContact.upsert({
    where: { phoneE164: phone },
    create: { phoneE164: phone },
    update: {},
  });
  await db.waSession.upsert({
    where: { phoneE164: phone },
    create: { phoneE164: phone, state: "IDLE", version },
    update: { state: "IDLE", version },
  });
}

describe("strikelab-onboard", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleStrikelabOnboard", () => {
    it("refuses if no Yogo customer found", async () => {
      mockedFindCustomer.mockResolvedValueOnce(null);
      await handleStrikelabOnboard(makeSession(PHONE_ADULT));

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("Marcelo"),
      );
    });

    it("refuses if Yogo DOB is null", async () => {
      mockedFindCustomer.mockResolvedValueOnce({
        id: CID_NO_DOB,
        phone: PHONE_NO_DOB,
        email: "nodob@test.com",
      });
      mockedGetUserDetail.mockResolvedValueOnce({
        id: CID_NO_DOB,
        date_of_birth: null,
      });

      await handleStrikelabOnboard(makeSession(PHONE_NO_DOB));

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_NO_DOB,
        expect.stringContaining("actualiza a tua data de nascimento"),
      );
    });

    it("excludes users under 13", async () => {
      mockedFindCustomer.mockResolvedValueOnce({
        id: CID_YOUNG,
        phone: PHONE_YOUNG,
      });
      mockedGetUserDetail.mockResolvedValueOnce({
        id: CID_YOUNG,
        date_of_birth: "2020-01-01", // ~6 years old
      });

      await handleStrikelabOnboard(makeSession(PHONE_YOUNG));

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_YOUNG,
        expect.stringContaining("idades 13+"),
      );
    });

    it("sends parental consent message for minors (13-17)", async () => {
      await seedWaSession(PHONE_MINOR);
      mockedFindCustomer.mockResolvedValueOnce({
        id: CID_MINOR,
        phone: PHONE_MINOR,
        email: "minor@test.com",
      });
      mockedGetUserDetail.mockResolvedValueOnce({
        id: CID_MINOR,
        date_of_birth: "2012-01-01", // ~14 years old
      });

      await handleStrikelabOnboard(makeSession(PHONE_MINOR));

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_MINOR,
        expect.stringContaining("encarregado de educação"),
      );

      // Verify identity was created with birthYear
      const identity = await db.gamificationIdentity.findUnique({
        where: { customerId: CID_MINOR },
      });
      expect(identity?.birthYear).toBe(2012);
    });

    it("auto-opt-in for adults — asks referral code directly", async () => {
      await seedWaSession(PHONE_ADULT);
      mockedFindCustomer.mockResolvedValueOnce({
        id: CID_ADULT,
        phone: PHONE_ADULT,
        email: "adult@test.com",
      });
      mockedGetUserDetail.mockResolvedValueOnce({
        id: CID_ADULT,
        date_of_birth: "1995-06-15",
      });

      await handleStrikelabOnboard(makeSession(PHONE_ADULT));

      // Should ask for referral code (not consent buttons)
      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("código de indicação"),
      );

      // Verify identity was created with auto-opt-in
      const identity = await db.gamificationIdentity.findUnique({
        where: { customerId: CID_ADULT },
      });
      expect(identity).not.toBeNull();
      expect(identity?.birthYear).toBe(1995);
      expect(identity?.consentTraining).toBe(true);
      expect(identity?.optInAt).not.toBeNull();

      // Verify event was emitted
      const event = await db.gamificationEventLog.findFirst({
        where: { customerId: CID_ADULT, eventType: "identity_created" },
      });
      expect(event).not.toBeNull();
    });

    it("recognises already onboarded student", async () => {
      await seedWaSession(PHONE_ADULT);
      mockedFindCustomer.mockResolvedValueOnce({
        id: CID_ADULT,
        phone: PHONE_ADULT,
        email: "adult@test.com",
      });

      await handleStrikelabOnboard(makeSession(PHONE_ADULT));

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("Já estás inscrito"),
      );
    });
  });

  describe("handleStrikelabReferral", () => {
    /** Seed an inviter identity with a known referral code. */
    async function seedInviter() {
      await db.gamificationIdentity.upsert({
        where: { customerId: CID_INVITER },
        create: {
          customerId: CID_INVITER,
          phoneE164: PHONE_INVITER,
          referralCode: TEST_REFERRAL_CODE,
          consentTraining: true,
          optInAt: new Date(),
        },
        update: { referralCode: TEST_REFERRAL_CODE },
      });
    }

    it("skip word 'não' → sends welcome without referral", async () => {
      await seedWaSession(PHONE_ADULT);
      await handleStrikelabReferral(makeSession(PHONE_ADULT, "STRIKELAB_AWAIT_REFERRAL"), "não");

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("Bem-vindo ao StrikeLab"),
      );
      expect(mockedSendText).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("bónus"),
      );
    });

    it("skip word 'nao tenho' → sends welcome without referral", async () => {
      await seedWaSession(PHONE_ADULT);
      await handleStrikelabReferral(makeSession(PHONE_ADULT, "STRIKELAB_AWAIT_REFERRAL"), "nao tenho");

      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("Bem-vindo ao StrikeLab"),
      );
    });

    it("valid referral code → links referral + sends bonus message + welcome", async () => {
      await seedInviter();
      await seedWaSession(PHONE_ADULT);
      // The adult identity must exist (auto-opted in)
      await db.gamificationIdentity.upsert({
        where: { customerId: CID_ADULT },
        create: {
          customerId: CID_ADULT,
          phoneE164: PHONE_ADULT,
          consentTraining: true,
          optInAt: new Date(),
        },
        update: {},
      });

      await handleStrikelabReferral(
        makeSession(PHONE_ADULT, "STRIKELAB_AWAIT_REFERRAL"),
        TEST_REFERRAL_CODE,
      );

      // Verify referral was created
      const referral = await db.referral.findUnique({
        where: { referredCustomerId: CID_ADULT },
      });
      expect(referral).not.toBeNull();
      expect(referral?.inviterCustomerId).toBe(CID_INVITER);
      expect(referral?.status).toBe("pending");

      // Verify bonus + welcome message
      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("bónus"),
      );
      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("Bem-vindo ao StrikeLab"),
      );
    });

    it("invalid referral code → sends 'not found' + welcome (no retry loop)", async () => {
      // Clean up referral from previous test
      await db.referral.deleteMany({ where: { referredCustomerId: CID_ADULT } });
      await seedWaSession(PHONE_ADULT);
      // Adult identity must exist
      await db.gamificationIdentity.upsert({
        where: { customerId: CID_ADULT },
        create: {
          customerId: CID_ADULT,
          phoneE164: PHONE_ADULT,
          consentTraining: true,
          optInAt: new Date(),
        },
        update: {},
      });

      await handleStrikelabReferral(
        makeSession(PHONE_ADULT, "STRIKELAB_AWAIT_REFERRAL"),
        "ZZZZZZ",
      );

      // No referral created
      const referral = await db.referral.findUnique({
        where: { referredCustomerId: CID_ADULT },
      });
      expect(referral).toBeNull();

      // Graceful fallback message
      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("não encontrado"),
      );
      expect(mockedSendText).toHaveBeenCalledWith(
        PHONE_ADULT,
        expect.stringContaining("Bem-vindo ao StrikeLab"),
      );
    });
  });
});
