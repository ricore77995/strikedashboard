import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture what fetch() receives so each test can assert on url, headers, body.
const capturedRequests: Array<{ url: string; init: RequestInit }> = [];

const mockFetch = vi.fn(async (url: string, init: RequestInit) => {
  capturedRequests.push({ url, init });
  return new Response("{}", { status: 200 });
});

// Stub global fetch before importing the module under test.
vi.stubGlobal("fetch", mockFetch);

// Must come after vi.stubGlobal so the module captures our mock.
import {
  sendText,
  sendList,
  sendButton,
  sendTemplate,
} from "../../../src/lib/wa/meta";

const PHONE_ID = "1234567890";
const ACCESS_TOKEN = "EAAXtest-token-value";

/** Return the body of the last fetch call, parsed as JSON. */
function lastBody(): Record<string, unknown> {
  const last = capturedRequests[capturedRequests.length - 1];
  return JSON.parse(last.init.body as string);
}

describe("WA Meta client", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    capturedRequests.length = 0;
    process.env.WA_PHONE_NUMBER_ID = PHONE_ID;
    process.env.WA_ACCESS_TOKEN = ACCESS_TOKEN;
  });

  afterEach(() => {
    delete process.env.WA_PHONE_NUMBER_ID;
    delete process.env.WA_ACCESS_TOKEN;
  });

  // ─── sendText ─────────────────────────────────────────────────────────

  describe("sendText", () => {
    it("posts correct JSON to Graph API with messaging_product, to (stripped +), type text", async () => {
      await sendText("+351912345678", "Hello world");

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const req = capturedRequests[0];
      expect(req.url).toBe(
        `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`,
      );
      expect(req.init.method).toBe("POST");

      const headers = req.init.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(req.init.body as string);
      expect(body).toEqual({
        messaging_product: "whatsapp",
        to: "351912345678", // leading + stripped
        type: "text",
        text: { body: "Hello world" },
      });
    });

    it("throws Error when WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN are missing", async () => {
      delete process.env.WA_PHONE_NUMBER_ID;
      delete process.env.WA_ACCESS_TOKEN;

      await expect(sendText("351912345678", "hi")).rejects.toThrow(
        "WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN not configured",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ─── sendList ─────────────────────────────────────────────────────────

  describe("sendList", () => {
    it("truncates buttonText to 20 chars and section title to 24 chars", async () => {
      const longButton = "A very long button text that exceeds twenty characters";
      const longTitle = "Section title that is way longer than twenty-four characters";

      await sendList("351912345678", {
        type: "list",
        bodyText: "Pick a class",
        buttonText: longButton,
        sections: [
          {
            title: longTitle,
            rows: [{ id: "r1", title: "Row 1" }],
          },
        ],
      });

      const body = lastBody() as { interactive: { action: { button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string }[]> }> } } };
      const action = body.interactive.action;

      // buttonText sliced to 20
      expect(action.button).toBe(longButton.slice(0, 20));
      expect(action.button).toHaveLength(20);

      // section title sliced to 24
      expect(action.sections[0].title).toBe(longTitle.slice(0, 24));
      expect(action.sections[0].title).toHaveLength(24);
    });

    it("omits description when row.description is undefined", async () => {
      await sendList("351912345678", {
        type: "list",
        bodyText: "Choose",
        buttonText: "Pick",
        sections: [
          {
            title: "HOJE",
            rows: [
              { id: "r1", title: "Row with desc", description: "has one" },
              { id: "r2", title: "Row without desc" },
            ],
          },
        ],
      });

      const body = lastBody() as { interactive: { action: { sections: Array<{ rows: Record<string, string>[] }> } } };
      const rows = body.interactive.action.sections[0].rows;

      // Row with description keeps it
      expect(rows[0]).toHaveProperty("description", "has one");

      // Row without description should NOT have the key at all
      expect(rows[1]).not.toHaveProperty("description");
      expect(Object.keys(rows[1])).toEqual(["id", "title"]);
    });
  });

  // ─── sendButton ───────────────────────────────────────────────────────

  describe("sendButton", () => {
    it("sends correct button payload with type: reply, id, title (sliced to 20)", async () => {
      const longTitle = "Confirm reservation now please";

      await sendButton("351912345678", {
        type: "button",
        bodyText: "Do you confirm?",
        buttons: [
          { id: "confirm_book", title: longTitle },
          { id: "cancel_book", title: "Cancel" },
        ],
      });

      const body = lastBody() as { type: string; interactive: { type: string; body: { text: string }; action: { buttons: Array<{ type: string; reply: { id: string; title: string } }> } } };

      expect(body.type).toBe("interactive");
      expect(body.interactive.type).toBe("button");
      expect(body.interactive.body).toEqual({ text: "Do you confirm?" });

      const buttons = body.interactive.action.buttons;
      expect(buttons).toHaveLength(2);

      // First button: type reply, id preserved, title sliced to 20
      expect(buttons[0].type).toBe("reply");
      expect(buttons[0].reply.id).toBe("confirm_book");
      expect(buttons[0].reply.title).toBe(longTitle.slice(0, 20));
      expect(buttons[0].reply.title).toHaveLength(20);

      // Second button: short title unchanged
      expect(buttons[1].type).toBe("reply");
      expect(buttons[1].reply.id).toBe("cancel_book");
      expect(buttons[1].reply.title).toBe("Cancel");
    });
  });

  // ─── sendTemplate ─────────────────────────────────────────────────────

  describe("sendTemplate", () => {
    it("with parameters includes components array with type: body", async () => {
      const params = [
        { type: "text" as const, text: "João" },
        { type: "text" as const, text: "Boxing" },
      ];

      await sendTemplate("351912345678", "trial_followup", "pt_PT", params);

      const body = lastBody() as { type: string; template: { name: string; language: { code: string }; components: Array<{ type: string; parameters: unknown[] }> } };

      expect(body.type).toBe("template");
      expect(body.template.name).toBe("trial_followup");
      expect(body.template.language).toEqual({ code: "pt_PT" });

      const components = body.template.components;
      expect(components).toHaveLength(1);
      expect(components[0]).toEqual({
        type: "body",
        parameters: params,
      });
    });

    it("with empty parameters sends empty components array", async () => {
      await sendTemplate("351912345678", "simple_hello", "en", []);

      const body = lastBody() as { type: string; template: { name: string; language: { code: string }; components: unknown[] } };
      expect(body.template.components).toEqual([]);
    });
  });

  // ─── send (generic) non-ok response ───────────────────────────────────

  describe("send error handling", () => {
    it("returns { ok: false, status, body } on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('{"error":{"message":"Template not found"}}', {
          status: 400,
        }),
      );

      const result = await sendText("351912345678", "hello");

      expect(result).toEqual({
        ok: false,
        status: 400,
        body: '{"error":{"message":"Template not found"}}',
      });
    });
  });
});
