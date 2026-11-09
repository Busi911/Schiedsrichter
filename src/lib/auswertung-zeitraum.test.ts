import { describe, expect, it } from "vitest";
import { auswertungsZeitraum, FEHLER_ENDE_VOR_START, istGueltigerTag, pruefeZeitraum } from "./auswertung-zeitraum";

const jetzt = new Date("2026-11-09T10:00:00Z");

describe("auswertungsZeitraum", () => {
  it("Von = Bis = 14.11.: der ganze Tag in deutscher Zeit (Winterzeit +01:00)", () => {
    const z = auswertungsZeitraum("2026-11-14", "2026-11-14", jetzt);
    expect(z.vonAb.toISOString()).toBe("2026-11-13T23:00:00.000Z");
    expect(z.bisVor?.toISOString()).toBe("2026-11-14T23:00:00.000Z");
    const spiel = new Date("2026-11-14T11:30:00Z"); // 12:30 Uhr
    expect(spiel >= z.vonAb && spiel < z.bisVor!).toBe(true);
  });
  it("ein Spiel am Folgetag (15.11.) gehört nicht dazu", () => {
    const z = auswertungsZeitraum("2026-11-14", "2026-11-14", jetzt);
    expect(new Date("2026-11-15T12:00:00Z") < z.bisVor!).toBe(false);
  });
  it("auch spätabends (23:30 Uhr deutscher Zeit) liegt noch im Bis-Tag", () => {
    const z = auswertungsZeitraum("2026-11-14", "2026-11-14", jetzt);
    expect(new Date("2026-11-14T22:30:00Z") < z.bisVor!).toBe(true);
  });
  it("Sommerzeit: Tagesgrenzen +02:00", () => {
    const z = auswertungsZeitraum("2026-07-01", "2026-07-01", jetzt);
    expect(z.vonAb.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(z.bisVor?.toISOString()).toBe("2026-07-01T22:00:00.000Z");
  });
  it("Tag der Zeitumstellung (25.10.2026, 25 Stunden) wird vollständig erfasst", () => {
    const z = auswertungsZeitraum("2026-10-25", "2026-10-25", jetzt);
    expect(z.vonAb.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(z.bisVor?.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
  it("ohne Von: ab heute (deutsche Zeit), ohne Bis: unbegrenzt", () => {
    const z = auswertungsZeitraum(undefined, undefined, new Date("2026-11-09T23:30:00Z")); // schon 10.11. in Deutschland
    expect(z.vonAb.toISOString()).toBe("2026-11-09T23:00:00.000Z");
    expect(z.bisVor).toBeNull();
  });
  it("leere oder ungültige Werte werden ignoriert", () => {
    expect(auswertungsZeitraum("", "", jetzt).bisVor).toBeNull();
    expect(auswertungsZeitraum("quatsch", "2026-13-45", jetzt).bisVor).toBeNull();
  });
});

describe("istGueltigerTag", () => {
  it("prüft Format und Kalender", () => {
    expect(istGueltigerTag("2026-02-28")).toBe(true);
    expect(istGueltigerTag("2026-02-30")).toBe(false);
    expect(istGueltigerTag("14.11.2026")).toBe(false);
    expect(istGueltigerTag(undefined)).toBe(false);
  });
});

describe("pruefeZeitraum", () => {
  it("Bis vor Von: Fehlertext (Testbericht 09.11.2026: 20.11. bis 10.11.)", () => {
    expect(pruefeZeitraum("2026-11-20", "2026-11-10")).toBe(FEHLER_ENDE_VOR_START);
  });
  it("gleicher Tag und spätere Tage sind gültig", () => {
    expect(pruefeZeitraum("2026-11-14", "2026-11-14")).toBeNull();
    expect(pruefeZeitraum("2026-11-14", "2026-11-20")).toBeNull();
  });
  it("leere oder ungültige Werte sind kein Bereichsfehler", () => {
    expect(pruefeZeitraum(undefined, "2026-11-10")).toBeNull();
    expect(pruefeZeitraum("2026-11-20", "")).toBeNull();
    expect(pruefeZeitraum("quatsch", "2026-11-10")).toBeNull();
  });
});
