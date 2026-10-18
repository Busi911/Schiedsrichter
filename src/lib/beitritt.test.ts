import { describe, expect, it } from "vitest";
import { alterAm, istMinderjaehrig, pruefeBeitrittAntrag, pruefeHttpsUrl, type BeitrittEingabe } from "./beitritt";

const HEUTE = "2026-10-18";
const ok: BeitrittEingabe = { vorname: " Max ", name: "Muster", geburtsdatum: "2010-05-20", email: " Max@Beispiel.DE ", telefon: "", geschlecht: "", mannschaftId: "", datenschutz: true, satzung: true, fotos: false };

describe("pruefeBeitrittAntrag", () => {
  it("gültiger Antrag: Daten bereinigt, E-Mail klein, Einwilligungen gespeichert", () => {
    expect(pruefeBeitrittAntrag(ok, { satzungErforderlich: true, heute: HEUTE })).toEqual({
      wert: {
        vorname: "Max", name: "Muster", geburtsdatum: "2010-05-20", email: "max@beispiel.de", telefon: null, geschlecht: null, mannschaftId: null,
        einwilligungen: { datenschutz: true, fotos: false, vereinigung: true },
      },
    });
  });
  it("Pflichtfelder", () => {
    for (const teil of [{ vorname: "" }, { name: " " }, { geburtsdatum: "" }, { email: "" }] as Partial<BeitrittEingabe>[]) {
      expect(pruefeBeitrittAntrag({ ...ok, ...teil }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("fehler");
    }
  });
  it("Geburtsdatum: ungültig, Zukunft, unplausibel alt", () => {
    for (const g of ["2010-02-30", "2027-01-01", "1900-01-01", "gestern"]) {
      expect(pruefeBeitrittAntrag({ ...ok, geburtsdatum: g }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("fehler");
    }
  });
  it("E-Mail-Format, Geschlecht, Mannschafts-ID", () => {
    expect(pruefeBeitrittAntrag({ ...ok, email: "kein-at" }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("fehler");
    expect(pruefeBeitrittAntrag({ ...ok, geschlecht: "x" }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("fehler");
    expect(pruefeBeitrittAntrag({ ...ok, mannschaftId: "keine-uuid" }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("fehler");
    expect(pruefeBeitrittAntrag({ ...ok, geschlecht: "w", mannschaftId: "11111111-1111-4111-8111-111111111111" }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("wert");
  });
  it("Datenschutz ist Pflicht, die Satzung nur mit hinterlegtem Link", () => {
    expect(pruefeBeitrittAntrag({ ...ok, datenschutz: false }, { satzungErforderlich: false, heute: HEUTE })).toHaveProperty("fehler");
    expect(pruefeBeitrittAntrag({ ...ok, satzung: false }, { satzungErforderlich: true, heute: HEUTE })).toHaveProperty("fehler");
    const ohneLink = pruefeBeitrittAntrag({ ...ok, satzung: false }, { satzungErforderlich: false, heute: HEUTE });
    expect(ohneLink).toHaveProperty("wert");
    expect("wert" in ohneLink && ohneLink.wert.einwilligungen.vereinigung).toBe(false);
  });
  it("Foto-Einwilligung ist freiwillig und wird gemerkt", () => {
    const r = pruefeBeitrittAntrag({ ...ok, fotos: true }, { satzungErforderlich: false, heute: HEUTE });
    expect("wert" in r && r.wert.einwilligungen.fotos).toBe(true);
  });
});

describe("Alter", () => {
  it("volle Jahre am Stichtag", () => {
    expect(alterAm("2008-10-18", HEUTE)).toBe(18);
    expect(alterAm("2008-10-19", HEUTE)).toBe(17);
    expect(istMinderjaehrig("2008-10-19", HEUTE)).toBe(true);
    expect(istMinderjaehrig("2008-10-18", HEUTE)).toBe(false);
  });
});

describe("pruefeHttpsUrl", () => {
  it("leer, https, http, Unsinn", () => {
    expect(pruefeHttpsUrl("  ")).toEqual({ url: null });
    expect(pruefeHttpsUrl("https://verein.de/satzung.pdf")).toEqual({ url: "https://verein.de/satzung.pdf" });
    expect(pruefeHttpsUrl("http://verein.de")).toHaveProperty("fehler");
    expect(pruefeHttpsUrl("javascript:alert(1)")).toHaveProperty("fehler");
    expect(pruefeHttpsUrl("kein link")).toHaveProperty("fehler");
  });
});
