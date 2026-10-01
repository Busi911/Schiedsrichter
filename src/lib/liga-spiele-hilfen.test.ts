import { describe, expect, it } from "vitest";
import { sammleVereinsSpiele, spielGruppe, type SpielAnsicht } from "./liga-spiele-hilfen";

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
      name: "Männer",
      kategorie: "herren" as const,
      teamtableId: "t1",
      spiele: [gespielt("a", "2026-09-20"), gespielt("b", "2026-09-27"), spiel("c", "2026-10-04"), spiel("x", "2026-10-11")],
    },
    {
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
