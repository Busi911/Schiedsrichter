import { describe, expect, it } from "vitest";
import { entscheideAuswaerts, type AuswaertsSpiel } from "./auswaerts-regeln";

const jetzt = new Date("2026-10-14T10:00:00Z");
const termin = { start: new Date("2026-10-20T14:00:00Z"), ort: "Halle Gast", ergebnisHeim: null, ergebnisAuswaerts: null };
const spiel: AuswaertsSpiel = { status: "geplant", start: new Date("2026-10-20T14:00:00Z"), halleName: "Halle Gast", toreHeim: null, toreGast: null };

describe("entscheideAuswaerts", () => {
  it("unverändert: nichts tun", () => {
    expect(entscheideAuswaerts(termin, spiel, jetzt)).toEqual({ aktion: "keine", ergebnis: undefined });
  });

  it("neue Zeit: verlegen, mit neuer Halle falls angegeben", () => {
    const neu = { ...spiel, status: "verlegt" as const, start: new Date("2026-10-21T16:00:00Z"), halleName: "Ausweichhalle" };
    expect(entscheideAuswaerts(termin, neu, jetzt)).toMatchObject({ aktion: "verlegen", start: neu.start, ort: "Ausweichhalle" });
  });

  it("weniger als eine Minute Unterschied ist keine Verlegung", () => {
    expect(entscheideAuswaerts(termin, { ...spiel, start: new Date(termin.start.getTime() + 30_000) }, jetzt).aktion).toBe("keine");
  });

  it("nur andere Halle: Ort aktualisieren, Einteilungen bleiben", () => {
    expect(entscheideAuswaerts(termin, { ...spiel, halleName: "Sporthalle Nord" }, jetzt)).toMatchObject({ aktion: "ort", ort: "Sporthalle Nord" });
    expect(entscheideAuswaerts(termin, { ...spiel, halleName: " halle gast " }, jetzt).aktion).toBe("keine");
    expect(entscheideAuswaerts(termin, { ...spiel, halleName: null }, jetzt).aktion).toBe("keine");
  });

  it("abgesagt oder verschwunden: absagen", () => {
    expect(entscheideAuswaerts(termin, { ...spiel, status: "abgesagt" }, jetzt).aktion).toBe("absagen");
    expect(entscheideAuswaerts(termin, null, jetzt).aktion).toBe("absagen");
  });

  it("vergangener Termin: nie verlegen oder absagen, Ergebnis aber übernehmen", () => {
    const vorbei = { ...termin, start: new Date("2026-10-10T14:00:00Z") };
    expect(entscheideAuswaerts(vorbei, null, jetzt)).toEqual({ aktion: "keine", ergebnis: undefined });
    expect(entscheideAuswaerts(vorbei, { ...spiel, status: "gespielt", start: new Date("2026-10-11T14:00:00Z"), toreHeim: 30, toreGast: 27 }, jetzt)).toEqual({
      aktion: "keine",
      ergebnis: { heim: 30, gast: 27 },
    });
  });

  it("gleiches Ergebnis wird nicht erneut gesetzt", () => {
    const mitErgebnis = { ...termin, start: new Date("2026-10-10T14:00:00Z"), ergebnisHeim: 30, ergebnisAuswaerts: 27 };
    expect(entscheideAuswaerts(mitErgebnis, { ...spiel, status: "gespielt", toreHeim: 30, toreGast: 27 }, jetzt).ergebnis).toBeUndefined();
  });
});
