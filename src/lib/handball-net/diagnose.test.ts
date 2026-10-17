import { describe, expect, it } from "vitest";
import { istErlaubterApiPfad, maskiereHnetJson, schluesselPfade } from "./diagnose";

// Synthetische Testdaten (keine echten handball.net-Antworten).
describe("maskiereHnetJson", () => {
  it("blendet Personenfelder aus, lässt die Struktur sichtbar und maskiert Kontaktdaten in Texten", () => {
    const r = maskiereHnetJson({
      id: 1,
      status: { is_finished: false },
      referees: [{ name: "X Y" }],
      note: "Mail a@b.de oder 0171 1234567",
      local: { id: 5, name: "Team A" },
    }) as Record<string, unknown>;
    expect(r.referees).toBe("[Personendaten ausgeblendet]");
    expect(r.note).toBe("Mail [mail] oder [tel]");
    expect(r.local).toEqual({ id: 5, name: "Team A" });
    expect((r.status as Record<string, unknown>).is_finished).toBe(false);
  });
});

describe("schluesselPfade", () => {
  it("listet Pfade mit Typ", () => {
    expect(schluesselPfade({ a: { b: 1 }, c: [{ d: "x" }], e: null })).toEqual([
      "a.b: number",
      "c: Array[1]",
      "c[].d: string",
      "e: null",
    ]);
  });
});

describe("istErlaubterApiPfad", () => {
  it("nur /api/-Pfade ohne Tricks", () => {
    expect(istErlaubterApiPfad("/api/new/matches?team_id=1&phase_id=2")).toBe(true);
    expect(istErlaubterApiPfad("https://evil.example/api/x")).toBe(false);
    expect(istErlaubterApiPfad("/api/../admin")).toBe(false);
    expect(istErlaubterApiPfad("//evil.example")).toBe(false);
    expect(istErlaubterApiPfad("/match/392196")).toBe(false);
  });
});
