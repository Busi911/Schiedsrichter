import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: sendMailMock }) } }));
vi.mock("./treuhand", () => ({ istEmpfaengerGesperrt: async () => false }));

describe("sendMail: List-Unsubscribe", () => {
  beforeEach(() => sendMailMock.mockClear());

  it("setzt bei abbestellbaren Mails die Ein-Klick-Header (API-URL), sonst keine", async () => {
    const { sendMail } = await import("./mailer");
    await sendMail("a@example.invalid", "x", "text", "<p>html</p>", { abmeldeUrl: "https://example.test/abmelden/tok.en" });
    const mitHeader = (sendMailMock.mock.calls[0] as unknown[])[0] as { headers?: Record<string, string> };
    expect(mitHeader.headers).toEqual({
      "List-Unsubscribe": "<https://example.test/api/abmelden/tok.en>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    await sendMail("a@example.invalid", "x", "text");
    const ohne = (sendMailMock.mock.calls[1] as unknown[])[0] as { headers?: unknown };
    expect(ohne.headers).toBeUndefined();
  });
});
