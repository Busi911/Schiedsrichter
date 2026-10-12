import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/admin", () => ({ adminDb: {} }));
vi.mock("@/db", () => ({ withTenant: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn() }));

import { trainerAnfrageInhalt, trainerEintragEingabePruefen } from "./trainer-einladung";

describe("trainerEintragEingabePruefen", () => {
  it("trimmt den Namen und normalisiert die E-Mail", () => {
    expect(trainerEintragEingabePruefen("  Max Muster ", " Max@Example.DE ")).toEqual({ name: "Max Muster", email: "max@example.de" });
  });
  it("lehnt leeren Namen, ungültige E-Mail und zu lange Eingaben ab", () => {
    expect(trainerEintragEingabePruefen("", "a@b.de")).toHaveProperty("fehler");
    expect(trainerEintragEingabePruefen("Max", "keine-mail")).toHaveProperty("fehler");
    expect(trainerEintragEingabePruefen("x".repeat(101), "a@b.de")).toHaveProperty("fehler");
    expect(trainerEintragEingabePruefen(undefined, undefined)).toHaveProperty("fehler");
  });
});

describe("trainerAnfrageInhalt", () => {
  it("nennt Person, Mannschaft und E-Mail", () => {
    const inhalt = trainerAnfrageInhalt("Max", "m@x.de", "männliche A", { text: "Zur Freischaltung", url: "https://x" });
    expect(inhalt.ueberschrift).toContain("Max");
    expect(inhalt.ueberschrift).toContain("männliche A");
    expect(inhalt.zeilen).toContain("E-Mail: m@x.de");
  });
});
