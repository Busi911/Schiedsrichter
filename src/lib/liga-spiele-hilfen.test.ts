import { describe, expect, it } from "vitest";
import {
  ergebnisHinweis,
  istAnstehend,
  istVergangen,
  letztesErgebnis,
  sammleVereinsSpiele,
  spielGruppe,
  type SpielAnsicht,
} from "./liga-spiele-hilfen";

const spiel = (id: string, datum: string, extra: Partial<SpielAnsicht> = {}): SpielAnsicht =>
  ({
    id,
    gruppeId: "g",
    spielnummer: null,
    spielcode: id,
    quelle: "nuliga",
    externeId: null,
    meetingId: null,
    datum,
    uhrzeit: "17:00",
    beginn: null,
    urspruenglicherBeginn: null,
    halleName: null,
    halleNummer: null,
    halleNuligaId: null,
    heimName: "A",
    gastName: "B",
    heimTeamtableId: "t1",
    gastTeamtableId: "t2",
    toreHeim: null,
    toreGast: null,
    halbzeitHeim: null,
    halbzeitGast: null,
    ergebnisBestaetigt: false,
    status: "geplant",
    synchronisiertAm: new Date(),
    ...extra,
  }) as SpielAnsicht;

const gespielt = (id: string, datum: string) =>
  spiel(id, datum, { toreHeim: 30, toreGast: 25, status: "gespielt" });

describe("sammleVereinsSpiele", () => {
  const jetzt = new Date("2026-10-01T10:00:00Z");
  const m = [
    {
      id: "m1",
      name: "Männer",
      kategorie: "herren" as const,
      teamtableId: "t1",
      spiele: [gespielt("a", "2026-09-20"), gespielt("b", "2026-09-27"), spiel("c", "2026-10-04"), spiel("x", "2026-10-11")],
    },
    {
      id: "m2",
      name: "Jugend B",
      kategorie: "jugend_maennlich" as const,
      teamtableId: "t9",
      // "x" ist ein Spiel beider Mannschaften (nur einmal, beide Namen)
      spiele: [gespielt("d", "2026-09-27"), spiel("x", "2026-10-11"), spiel("alt", "2026-09-01")],
    },
  ];

  it("liefert Ergebnisse neueste zuerst und anstehende Spiele nächste zuerst", () => {
    const { ergebnisse, anstehend } = sammleVereinsSpiele(m, jetzt);
    expect(ergebnisse.map((e) => e.spiel.id)).toEqual(["d", "b", "a"]);
    expect(anstehend.map((e) => e.spiel.id)).toEqual(["c", "x"]);
  });

  it("führt ein gemeinsames Spiel zweier eigener Mannschaften nur einmal", () => {
    const x = sammleVereinsSpiele(m, jetzt).anstehend.find((e) => e.spiel.id === "x")!;
    expect(x.teams).toEqual(["Männer", "Jugend B"]);
    expect(x.mannschaftIds).toEqual(["m1", "m2"]);
    expect(x.eigenTeamtable).toBe("t1");
  });

  it("blendet vergangene Spiele ohne Ergebnis aus und begrenzt die Anzahl", () => {
    const { ergebnisse, anstehend } = sammleVereinsSpiele(m, jetzt, { ergebnisse: 1, anstehend: 1 });
    expect(ergebnisse).toHaveLength(1);
    expect(anstehend).toHaveLength(1);
    expect(sammleVereinsSpiele(m, jetzt).anstehend.some((e) => e.spiel.id === "alt")).toBe(false);
  });

  it("ordnet Kategorien den Filter-Gruppen zu", () => {
    expect(spielGruppe("herren")).toBe("herren");
    expect(spielGruppe("jugend_weiblich")).toBe("jugend");
    expect(spielGruppe("sonstige")).toBe("kinder");
  });
});

describe("laufende Spiele und fehlende Ergebnisse", () => {
  const jetzt = new Date("2026-10-04T16:00:00Z"); // So 18:00 deutsche Zeit
  const anwurf = new Date("2026-10-04T15:00:00Z");
  const laufend = spiel("l", "2026-10-04", {
    meetingId: "5",
    beginn: anwurf,
    toreHeim: 14,
    toreGast: 12,
  });
  const gestern = spiel("g", "2026-10-03");
  const wochenAlt = spiel("w", "2026-09-27");
  const abgesagtGestern = spiel("a", "2026-10-03", { status: "abgesagt" });
  const mannschaft = (spiele: SpielAnsicht[]) => [
    { id: "m1", name: "Männer", kategorie: "herren" as const, teamtableId: "t1", spiele },
  ];

  it("ein Zwischenstand ist kein Ergebnis, sondern ein laufendes/anstehendes Spiel", () => {
    expect(istVergangen(laufend, jetzt)).toBe(false);
    expect(istAnstehend(laufend, jetzt)).toBe(true);
    const r = sammleVereinsSpiele(mannschaft([laufend]), jetzt);
    expect(r.ergebnisse).toHaveLength(0);
    expect(r.heute.map((e) => e.spiel.id)).toEqual(["l"]);
  });

  it("ein Spiel, das nach Mitternacht noch läuft, bleibt unter 'Heute'", () => {
    const nachMitternacht = new Date("2026-10-04T22:30:00Z"); // 00:30 am Folgetag
    const spaet = spiel("s", "2026-10-04", { meetingId: "5", beginn: new Date("2026-10-04T21:00:00Z"), toreHeim: 20, toreGast: 19 });
    expect(istAnstehend(spaet, nachMitternacht)).toBe(true);
  });

  it("ein genehmigtes Ergebnis zählt als Ergebnis, nicht als laufend", () => {
    const fertig = { ...laufend, ergebnisBestaetigt: true, status: "gespielt" } as SpielAnsicht;
    expect(istVergangen(fertig, jetzt)).toBe(true);
    expect(istAnstehend(fertig, jetzt)).toBe(false);
  });

  it("ein Spiel von gestern ohne Ergebnis verschwindet nicht, sondern steht als 'Ergebnis ausstehend' bei den Ergebnissen", () => {
    expect(istVergangen(gestern, jetzt)).toBe(true);
    expect(ergebnisHinweis(gestern, jetzt)).toBe("ausstehend");
    expect(sammleVereinsSpiele(mannschaft([gestern]), jetzt).ergebnisse.map((e) => e.spiel.id)).toEqual(["g"]);
  });

  it("ein abgesagtes vergangenes Spiel bleibt sichtbar (mit Status), ohne 'Ergebnis ausstehend'", () => {
    expect(sammleVereinsSpiele(mannschaft([abgesagtGestern]), jetzt).ergebnisse).toHaveLength(1);
    expect(ergebnisHinweis(abgesagtGestern, jetzt)).toBeNull();
  });

  it("nach 14 Tagen ohne Ergebnis fällt ein Spiel aus den Listen", () => {
    expect(istVergangen(wochenAlt, jetzt)).toBe(true);
    expect(istVergangen(spiel("x", "2026-09-10"), jetzt)).toBe(false);
  });

  it("ein heutiges Spiel ohne Ergebnis ist anstehend, nie 'ausstehend'", () => {
    const heute = spiel("h", "2026-10-04", { uhrzeit: "19:00" });
    expect(istAnstehend(heute, jetzt)).toBe(true);
    expect(ergebnisHinweis(heute, jetzt)).toBeNull();
  });

  it("ein heutiges Spiel ohne Ergebnis, dessen Anwurf über 90 Min her ist, zeigt 'Ergebnis folgt'", () => {
    const anwurf = new Date("2026-10-04T14:00:00Z");
    const s = spiel("h2", "2026-10-04", { uhrzeit: "16:00", beginn: anwurf });
    expect(ergebnisHinweis(s, new Date("2026-10-04T14:30:00Z"))).toBe("laeuft");
    expect(ergebnisHinweis(s, new Date("2026-10-04T17:00:00Z"))).toBe("ergebnis_folgt");
    expect(ergebnisHinweis({ ...s, status: "verlegt" } as SpielAnsicht, new Date("2026-10-04T17:00:00Z"))).toBeNull();
  });

  it("an einem Tag ohne Spiel ist 'heute' leer (die Startseite zeigt dann die nächsten Spiele)", () => {
    const morgen = spiel("m", "2026-10-05");
    const r = sammleVereinsSpiele(mannschaft([morgen]), jetzt);
    expect(r.heute).toHaveLength(0);
    expect(r.anstehend.map((e) => e.spiel.id)).toEqual(["m"]);
  });

  it("Hinweis statt Zahl: läuft gerade bzw. Ergebnis folgt", () => {
    expect(ergebnisHinweis(laufend, jetzt)).toBe("laeuft");
    expect(ergebnisHinweis(laufend, new Date("2026-10-04T17:30:00Z"))).toBe("ergebnis_folgt"); // 150 Min nach Anwurf
    expect(ergebnisHinweis(laufend, new Date("2026-10-04T19:00:00Z"))).toBeNull(); // 4 h: gilt wieder als vorläufiges Ergebnis
  });

  it("letztesErgebnis überspringt den Zwischenstand", () => {
    const vorher = spiel("v", "2026-09-27", { toreHeim: 30, toreGast: 25, status: "gespielt", ergebnisBestaetigt: true });
    expect(letztesErgebnis([vorher, laufend], jetzt)?.id).toBe("v");
    expect(letztesErgebnis([laufend], jetzt)).toBeNull();
  });
});
