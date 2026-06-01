import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/db";

// Mock Yogo lookup + fetch to avoid DB-URL requirements in transitive imports.
vi.mock("@/lib/yogo/lookup", () => ({
  findCustomerByPhone: vi.fn(),
  getYogoUserDetail: vi.fn(),
  clearCustomerCache: vi.fn(),
}));
vi.mock("@/lib/yogo/fetch", () => ({ yogoFetch: vi.fn() }));

// Mock WA send.
vi.mock("@/lib/wa/meta", () => ({
  sendText: vi.fn().mockResolvedValue({ ok: true }),
  sendButton: vi.fn().mockResolvedValue({ ok: true }),
  sendList: vi.fn().mockResolvedValue({ ok: true }),
}));

import { handleStrikelabMe } from "@/lib/wa/handlers/strikelab-onboard";
import { sendText } from "@/lib/wa/meta";

const mockedSendText = vi.mocked(sendText);

const CID = 90060;
const PHONE = "+351911000060";
const PHONE_UNKNOWN = "+351911000061";

async function cleanup() {
  await db.gamificationIdentity.deleteMany({ where: { customerId: CID } });
}

async function seedIdentity(over: Partial<{ optInAt: Date | null; consentTraining: boolean; erasedAt: Date | null }>) {
  await cleanup();
  await db.gamificationIdentity.create({
    data: {
      customerId: CID,
      phoneE164: PHONE,
      optInAt: over.optInAt === undefined ? new Date() : over.optInAt,
      consentTraining: over.consentTraining ?? true,
      erasedAt: over.erasedAt ?? null,
    },
  });
}

describe("handleStrikelabMe", () => {
  let origSecret: string | undefined;
  let origBase: string | undefined;

  beforeAll(cleanup);
  afterAll(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    origSecret = process.env.STRIKELAB_LINK_SECRET;
    origBase = process.env.STRIKELAB_PUBLIC_BASE_URL;
    process.env.STRIKELAB_LINK_SECRET = "test-secret";
    process.env.STRIKELAB_PUBLIC_BASE_URL = "https://dash.strikershouse.pt";
  });

  afterEach(() => {
    if (origSecret === undefined) delete process.env.STRIKELAB_LINK_SECRET;
    else process.env.STRIKELAB_LINK_SECRET = origSecret;
    if (origBase === undefined) delete process.env.STRIKELAB_PUBLIC_BASE_URL;
    else process.env.STRIKELAB_PUBLIC_BASE_URL = origBase;
  });

  it("nudges to onboard when no identity exists", async () => {
    await handleStrikelabMe(PHONE_UNKNOWN);
    expect(mockedSendText).toHaveBeenCalledWith(PHONE_UNKNOWN, expect.stringContaining("strikelab"));
  });

  it("nudges to onboard when identity exists but has not consented", async () => {
    await seedIdentity({ optInAt: null, consentTraining: false });
    await handleStrikelabMe(PHONE);
    expect(mockedSendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("Ainda não estás"));
  });

  it("sends the personal link when onboarded + consented + configured", async () => {
    await seedIdentity({});
    await handleStrikelabMe(PHONE);
    const [, body] = mockedSendText.mock.calls[0];
    expect(body).toContain("https://dash.strikershouse.pt/strikelab/me?t=");
    expect(body).toContain("pessoal");
  });

  it("tells the student it is being configured when the base URL is unset", async () => {
    await seedIdentity({});
    delete process.env.STRIKELAB_PUBLIC_BASE_URL;
    await handleStrikelabMe(PHONE);
    expect(mockedSendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("configurado"));
  });

  it("refuses an erased profile", async () => {
    await seedIdentity({ erasedAt: new Date() });
    await handleStrikelabMe(PHONE);
    expect(mockedSendText).toHaveBeenCalledWith(PHONE, expect.stringContaining("removido"));
  });
});
