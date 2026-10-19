import { describe, expect, it } from "vitest";
import { baueAufgaben, baueHero, baueProfilHero, begruessung, besetzungsChips, spielTitel, tagesGrenzen, type ProfilEinsatz, type SpielHeute } from "./neues-dashboard";

describe("begruessung", () => {
  it("richtet sich nach deutscher Uhrzeit, nicht nach UTC", () => {
    expect(begruessung(new Date("2026-10-18T07:00:00Z"))).toBe("Guten Morgen!"); // 09:00 Berlin
    expect(begruessung(new Date("2026-10-18T10:00:00Z"))).toBe("Guten Tag!"); // 12:00
    expect(begruessung(new Date("2026-10-18T17:30:00Z"))).toBe("Guten Abend!"); // 19:30
    expect(begruessung(new Date("2026-10-18T01:00:00Z"))).toBe("Guten Abend!"); // 03:00, noch Nacht
  });
  it("nutzt den Vornamen, wenn bekannt", () => {
    expect(begruessung(new Date("2026-10-18T17:30:00Z"), "Sabine Muster")).toBe("Guten Abend, Sabine!");
    expect(begruessung(new Date("2026-10-18T17:30:00Z"), "  ")).toBe("Guten Abend!");
    expect(begruessung(new Date("2026-10-18T17:30:00Z"), null)).toBe("Guten Abend!");
  });
});

describe("tagesGrenzen", () => {
  it("Tag und Woche (Mo–So) in deutscher Zeit", () => {
    // Sonntag 18.10.2026, 19:30 Berlin (MESZ, +02:00)
    const g = tagesGrenzen(new Date("2026-10-18T17:30:00Z"));
    expect(g.tagVon.toISOString()).toBe("2026-10-17T22:00:00.000Z"); // 18.10. 00:00 Berlin
    expect(g.tagBis.toISOString()).toBe("2026-10-18T22:00:00.000Z");
    expect(g.wocheVon.toISOString()).toBe("2026-10-11T22:00:00.000Z"); // Montag 12.10. 00:00
    expect(g.wocheBis.toISOString()).toBe("2026-10-18T22:00:00.000Z"); // Montag 19.10. 00:00 = Ende Sonntag
  });
  it("Zeitumstellung: der Tag der Umstellung hat 25 Stunden", () => {
    const g = tagesGrenzen(new Date("2026-10-25T10:00:00Z")); // Sonntag 25.10.2026, MESZ -> MEZ
    expect((g.tagBis.getTime() - g.tagVon.getTime()) / 3_600_000).toBe(25);
  });
});

describe("spielTitel", () => {
  it("nimmt nur den ersten Teil der Beschreibung", () => {
    expect(spielTitel("HSG A – HSG B · mJC · Staffel 1 · KÜRZEL")).toBe("HSG A – HSG B");
    expect(spielTitel("Freundschaftsspiel")).toBe("Freundschaftsspiel");
    expect(spielTitel(" ")).toBeNull();
    expect(spielTitel(null)).toBeNull();
  });
});

const spiel = (id: string, start: string): SpielHeute => ({ id, start: new Date(start), titel: id, mannschaft: null, ort: null });

describe("besetzungsChips", () => {
  it("ohne Eintrag in der Besetzungs-Rechnung ist alles besetzt", () => {
    expect(besetzungsChips(undefined)).toEqual([{ text: "Alles besetzt", offen: false }]);
  });
  it("zeigt fehlende Dienste und erledigte als Haken", () => {
    const chips = besetzungsChips({ schiriOffen: false, zeitnehmerOffen: true, helferdienstOffen: true });
    expect(chips).toEqual([
      { text: "Schiedsrichter ✓", offen: false },
      { text: "Zeitnehmer fehlt", offen: true },
      { text: "Helferdienst fehlt", offen: true },
    ]);
  });
});

describe("baueHero", () => {
  const jetzt = new Date("2026-10-18T12:00:00Z");
  const leer = new Map();
  it("nimmt das erste heutige Spiel, das noch nicht länger als zwei Stunden läuft", () => {
    const heute = [spiel("frueh", "2026-10-18T08:00:00Z"), spiel("mittag", "2026-10-18T11:00:00Z"), spiel("spaet", "2026-10-18T15:00:00Z")];
    const h = baueHero(heute, [], jetzt, leer);
    expect(h.art).toBe("heute");
    expect(h.spiel?.id).toBe("mittag"); // 11:00 läuft noch (bis 13:00)
    expect(h.anzahlHeute).toBe(3);
  });
  it("heute vorbei: das nächste künftige Spiel", () => {
    const h = baueHero([spiel("frueh", "2026-10-18T08:00:00Z")], [spiel("naechste-woche", "2026-10-25T13:00:00Z"), spiel("morgen", "2026-10-19T17:00:00Z")], jetzt, leer);
    expect(h.art).toBe("naechstes");
    expect(h.spiel?.id).toBe("morgen");
    expect(h.anzahlHeute).toBe(1);
  });
  it("nichts in Sicht", () => {
    expect(baueHero([], [], jetzt, leer)).toEqual({ art: "keins", anzahlHeute: 0, spiel: null, chips: [] });
  });
  it("Chips kommen aus dem Besetzungsstand des gewählten Spiels", () => {
    const staende = new Map([["a", { schiriOffen: false, zeitnehmerOffen: false, helferdienstOffen: true }]]);
    const h = baueHero([spiel("a", "2026-10-18T14:00:00Z")], [], jetzt, staende);
    expect(h.chips.map((c) => c.text)).toEqual(["Schiedsrichter ✓", "Zeitnehmer ✓", "Helferdienst fehlt"]);
  });
});

describe("baueAufgaben", () => {
  const alles = { unbesetzt7Tage: 3, abmeldeanfragen: 2, selbsteintragungen: 1, beitrittsantraege: 4, kannBearbeiten: true };
  it("listet nur, was offen ist, in fester Reihenfolge", () => {
    expect(baueAufgaben(alles).map((a) => a.schluessel)).toEqual(["dienste", "abmeldungen", "selbsteintragungen", "beitritt"]);
    expect(baueAufgaben({ ...alles, unbesetzt7Tage: 0, selbsteintragungen: 0 }).map((a) => a.schluessel)).toEqual(["abmeldungen", "beitritt"]);
    expect(baueAufgaben({ unbesetzt7Tage: 0, abmeldeanfragen: 0, selbsteintragungen: 0, beitrittsantraege: 0, kannBearbeiten: true })).toEqual([]);
  });
  it("Einzahl und Mehrzahl", () => {
    const eine = baueAufgaben({ unbesetzt7Tage: 1, abmeldeanfragen: 1, selbsteintragungen: 1, beitrittsantraege: 1, kannBearbeiten: true });
    expect(eine.map((a) => a.titel)).toEqual(["Termin mit offenen Diensten", "Abmeldeanfrage", "Selbsteintragung", "Beitrittsantrag"]);
  });
  it("Erste Schritte und Rechnungsdaten kommen vor den Aufgaben des Spielbetriebs", () => {
    const a = baueAufgaben({ ...alles, ersteSchritte: { erledigt: 2, gesamt: 5 }, rechnungsdatenFehlen: true });
    expect(a.map((x) => x.schluessel)).toEqual(["erste-schritte", "rechnungsdaten", "dienste", "abmeldungen", "selbsteintragungen", "beitritt"]);
    expect(a[0].anzahl).toBe(3);
    expect(a[0].hinweis).toBe("2 von 5 erledigt");
  });
  it("lesende Admins sehen 'Ansehen' statt Handlungsaufforderung", () => {
    const a = baueAufgaben({ ...alles, kannBearbeiten: false });
    expect(a.map((x) => x.aktion)).toEqual(["Ansehen", "Ansehen", "Ansehen", "Ansehen"]);
  });
});

describe("baueProfilHero", () => {
  const jetzt = new Date("2026-10-18T12:00:00Z");
  const einsatz = (id: string, start: string): ProfilEinsatz => ({ id, start: new Date(start), titel: id, ort: null, rollen: ["Zeitnehmer"] });
  it("nimmt den nächsten eigenen Einsatz und zählt die der nächsten sieben Tage", () => {
    const h = baueProfilHero([einsatz("alt", "2026-10-17T10:00:00Z"), einsatz("morgen", "2026-10-19T14:00:00Z"), einsatz("in-5", "2026-10-23T14:00:00Z"), einsatz("in-20", "2026-11-07T14:00:00Z")], jetzt);
    expect(h.art).toBe("einsatz");
    expect(h.einsatz?.id).toBe("morgen");
    expect(h.anzahl7Tage).toBe(2);
    expect(h.heute).toBe(false);
  });
  it("heute und noch laufend zählt (bis zwei Stunden nach Beginn)", () => {
    const h = baueProfilHero([einsatz("laeuft", "2026-10-18T11:00:00Z")], jetzt);
    expect(h.einsatz?.id).toBe("laeuft");
    expect(h.heute).toBe(true);
  });
  it("ohne Einsatz", () => {
    expect(baueProfilHero([], jetzt)).toEqual({ art: "keins", einsatz: null, anzahl7Tage: 0, heute: false });
    expect(baueProfilHero([einsatz("vorbei", "2026-10-18T08:00:00Z")], jetzt).art).toBe("keins");
  });
});
