import { describe, expect, it } from "vitest";
import {
  kombiniereSchiedsrichterZuordnungen,
  terminAlsCsv,
  type AuswertungsBasisZeile,
} from "./termin-auswertung";

const basisZeile = {
  id: "t1",
  typ: "testspiel" as const,
  start: new Date("2026-05-01T18:30:00"),
  ende: null,
  ort: "Sporthalle",
  beschreibung: "gegen TuS Musterstadt",
  pflichtspiel: null,
  freundschaftsTyp: null,
  mannschaftName: "Herren 1",
  schiedsrichterName: null,
  schiedsrichterEmail: null,
};

describe("terminAlsCsv", () => {
  it("enthält Kopfzeile und formatierte Datenzeile", () => {
    const csv = terminAlsCsv([basisZeile]);
    const zeilen = csv.replace(/^﻿/, "").split("\n");

    expect(zeilen[0]).toBe(
      "Datum;Uhrzeit;Typ;Ort;Beschreibung;Mannschaft;Schiedsrichter;Schiedsrichter-E-Mail"
    );
    expect(zeilen[1]).toContain("testspiel");
    expect(zeilen[1]).toContain("Sporthalle");
    expect(zeilen[1]).toContain("Herren 1");
  });

  it("escaped Beschreibungen mit Semikolon", () => {
    const csv = terminAlsCsv([
      { ...basisZeile, beschreibung: "Heim; Auswärts getauscht" },
    ]);
    expect(csv).toContain('"Heim; Auswärts getauscht"');
  });

  it("liefert nur die Kopfzeile bei leerer Liste", () => {
    const csv = terminAlsCsv([]);
    expect(csv.replace(/^﻿/, "").split("\n")).toHaveLength(1);
  });
});

function basisAuswertungsZeile(
  overrides: Partial<AuswertungsBasisZeile> = {}
): AuswertungsBasisZeile {
  return {
    id: "t1",
    typ: "rundenspiel",
    start: new Date("2026-05-01T18:30:00"),
    ende: null,
    ort: "Sporthalle",
    beschreibung: "gegen TuS Musterstadt",
    pflichtspiel: null,
    freundschaftsTyp: null,
    mannschaftName: "Herren 1",
    icsSchiedsrichterId: null,
    icsSchiedsrichterName: null,
    icsSchiedsrichterEmail: null,
    ...overrides,
  };
}

describe("kombiniereSchiedsrichterZuordnungen", () => {
  it("übernimmt die ICS-Selbst-Abo-Zuordnung, wenn keine manuelle Zuordnung existiert", () => {
    const [zeile] = kombiniereSchiedsrichterZuordnungen(
      [
        basisAuswertungsZeile({
          icsSchiedsrichterId: "u1",
          icsSchiedsrichterName: "Max Mustermann",
          icsSchiedsrichterEmail: "max@example.org",
        }),
      ],
      []
    );
    expect(zeile.schiedsrichterName).toBe("Max Mustermann");
    expect(zeile.schiedsrichterEmail).toBe("max@example.org");
  });

  it("übernimmt eine manuelle Einzel-Zuordnung (termin_zuordnung) statt '—'", () => {
    const [zeile] = kombiniereSchiedsrichterZuordnungen(
      [basisAuswertungsZeile()],
      [{ terminId: "t1", userId: "u1", name: "Sabrina Gerullis", email: "sabrina@example.org" }]
    );
    expect(zeile.schiedsrichterName).toBe("Sabrina Gerullis");
    expect(zeile.schiedsrichterEmail).toBe("sabrina@example.org");
  });

  it("verbindet ein Gespann (zwei manuelle Zuordnungen) mit ' / '", () => {
    const [zeile] = kombiniereSchiedsrichterZuordnungen(
      [basisAuswertungsZeile()],
      [
        { terminId: "t1", userId: "u1", name: "Yannick Eike", email: "eike@example.org" },
        { terminId: "t1", userId: "u2", name: "Nicki Fischer", email: "fischer@example.org" },
      ]
    );
    expect(zeile.schiedsrichterName).toBe("Yannick Eike / Nicki Fischer");
    expect(zeile.schiedsrichterEmail).toBe("eike@example.org / fischer@example.org");
  });

  it("zeigt eine extern zugeordnete Person (kein Login, nur externerName) an", () => {
    const [zeile] = kombiniereSchiedsrichterZuordnungen(
      [basisAuswertungsZeile()],
      [{ terminId: "t1", userId: null, name: "Externer Schiri", email: null }]
    );
    expect(zeile.schiedsrichterName).toBe("Externer Schiri");
  });

  it("filtert nach schiedsrichterId über beide Quellen (ICS und manuell)", () => {
    const basis = [
      basisAuswertungsZeile({ id: "t1", icsSchiedsrichterId: "u1" }),
      basisAuswertungsZeile({ id: "t2" }),
      basisAuswertungsZeile({ id: "t3" }),
    ];
    const manuell = [{ terminId: "t2", userId: "u2", name: "Sabrina Gerullis", email: null }];

    expect(
      kombiniereSchiedsrichterZuordnungen(basis, manuell, "u1").map((z) => z.id)
    ).toEqual(["t1"]);
    expect(
      kombiniereSchiedsrichterZuordnungen(basis, manuell, "u2").map((z) => z.id)
    ).toEqual(["t2"]);
    expect(
      kombiniereSchiedsrichterZuordnungen(basis, manuell, "u3").map((z) => z.id)
    ).toEqual([]);
  });

  it("liefert alle Zeilen unverändert, wenn kein Filter gesetzt ist", () => {
    const basis = [basisAuswertungsZeile({ id: "t1" }), basisAuswertungsZeile({ id: "t2" })];
    expect(
      kombiniereSchiedsrichterZuordnungen(basis, []).map((z) => z.id)
    ).toEqual(["t1", "t2"]);
  });
});
