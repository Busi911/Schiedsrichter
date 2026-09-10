import { describe, expect, it } from "vitest";
import {
  ergaenzeDienstZuordnungen,
  kombiniereSchiedsrichterZuordnungen,
  type AuswertungsBasisZeile,
} from "./termin-auswertung";

describe("ergaenzeDienstZuordnungen", () => {
  it("ordnet Namen der passenden Rolle und dem passenden Termin zu", () => {
    const [zeile] = ergaenzeDienstZuordnungen(
      [{ id: "t1" }],
      [
        { terminId: "t1", funktionstraegerTyp: "ordner", name: "Lena Fischer" },
        { terminId: "t1", funktionstraegerTyp: "kioskdienst", name: "Sven Wagner" },
        { terminId: "t2", funktionstraegerTyp: "ordner", name: "Person bei anderem Termin" },
      ]
    );
    expect(zeile.ordnerName).toBe("Lena Fischer");
    expect(zeile.kioskdienstName).toBe("Sven Wagner");
    expect(zeile.kassiererName).toBeNull();
    expect(zeile.zeitnehmerName).toBeNull();
    expect(zeile.sekretaerName).toBeNull();
  });

  it("verbindet mehrere Personen derselben Rolle mit ', '", () => {
    const [zeile] = ergaenzeDienstZuordnungen(
      [{ id: "t1" }],
      [
        { terminId: "t1", funktionstraegerTyp: "kioskdienst", name: "Sven Wagner" },
        { terminId: "t1", funktionstraegerTyp: "kioskdienst", name: "Anna Klein" },
      ]
    );
    expect(zeile.kioskdienstName).toBe("Sven Wagner, Anna Klein");
  });

  it("ignoriert Zuordnungen ohne Namen (weder Login noch externerName)", () => {
    const [zeile] = ergaenzeDienstZuordnungen(
      [{ id: "t1" }],
      [{ terminId: "t1", funktionstraegerTyp: "kassierer", name: null }]
    );
    expect(zeile.kassiererName).toBeNull();
  });

  it("liefert null für alle Rollen, wenn keine Zuordnungen existieren", () => {
    const [zeile] = ergaenzeDienstZuordnungen([{ id: "t1" }], []);
    expect(zeile).toMatchObject({
      ordnerName: null,
      kioskdienstName: null,
      kassiererName: null,
      zeitnehmerName: null,
      sekretaerName: null,
    });
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
    nuligaSchiedsrichterKuerzel: null,
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

  it("zeigt das nuLiga-Kürzel als Fallback, wenn noch niemand zugeordnet ist", () => {
    const [zeile] = kombiniereSchiedsrichterZuordnungen(
      [basisAuswertungsZeile({ nuligaSchiedsrichterKuerzel: "Schu." })],
      []
    );
    expect(zeile.schiedsrichterName).toBe(
      "Schu. (laut nuLiga, noch nicht zugeordnet)"
    );
  });

  it("bevorzugt eine echte Zuordnung gegenüber dem nuLiga-Kürzel-Fallback", () => {
    const [zeile] = kombiniereSchiedsrichterZuordnungen(
      [basisAuswertungsZeile({ nuligaSchiedsrichterKuerzel: "Geru." })],
      [{ terminId: "t1", userId: "u1", name: "Sabrina Gerullis", email: null }]
    );
    expect(zeile.schiedsrichterName).toBe("Sabrina Gerullis");
  });

  it("lässt den nuLiga-Kürzel-Fallback beim Schiedsrichter-Filter unberücksichtigt", () => {
    const basis = [basisAuswertungsZeile({ id: "t1", nuligaSchiedsrichterKuerzel: "Schu." })];
    expect(
      kombiniereSchiedsrichterZuordnungen(basis, [], "u1").map((z) => z.id)
    ).toEqual([]);
  });
});
