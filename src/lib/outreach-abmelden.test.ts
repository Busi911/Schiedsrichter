import { describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET = "test-secret-1234567890";

// adminDb mocken — outreach-abmelden importiert adminDb für die DB-Updates.
vi.mock("@/db/admin", () => ({
  adminDb: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  vereinKontakt: {},
}));

import { outreachAbmeldeToken, pruefeOutreachAbmeldeToken } from "./outreach-abmelden";

describe("outreachAbmeldeToken", () => {
  it("erzeugt einen gültigen Token und verifiziert ihn", () => {
    const vereinId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const token = outreachAbmeldeToken(vereinId);
    const ergebnis = pruefeOutreachAbmeldeToken(token);
    expect(ergebnis).toBe(vereinId);
  });

  it("lehnt einen manipulierten Token ab", () => {
    const vereinId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    const token = outreachAbmeldeToken(vereinId);
    const manipuliert = token.slice(0, -4) + "XXXX";
    const ergebnis = pruefeOutreachAbmeldeToken(manipuliert);
    expect(ergebnis).toBeNull();
  });

  it("lehnt einen Token mit ungültiger vereinId ab", () => {
    const token = outreachAbmeldeToken("keine-gültige-uuid");
    const ergebnis = pruefeOutreachAbmeldeToken(token);
    expect(ergebnis).toBeNull();
  });

  it("lehnt Müll ab", () => {
    expect(pruefeOutreachAbmeldeToken("")).toBeNull();
    expect(pruefeOutreachAbmeldeToken("abc")).toBeNull();
    expect(pruefeOutreachAbmeldeToken("a.b.c")).toBeNull();
  });
});
