import { describe, expect, it } from "vitest";
import {
  findeMannschaft,
  gruppiereUnbekannteMannschaften,
  normalisiereMannschaftsname,
  parseRundenspielJson,
} from "./rundenspiel-import";

function beispielJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify([
    {
      updated: "2026-08-11T13:51:06.676Z",
      source: "nuLiga HHV",
      location: { id: 30402, name: "Sporthalle Heuchelheim" },
      count: 1,
      events: [
        {
          date: "2026-08-02",
          time: "15:00",
          start: "2026-08-02T15:00:00+02:00",
          title: "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1",
          gameNumber: "0",
          category: "Mä/männl.",
          league: "F 2026-08-02 M TSF Heuchelheim (BOL) gg HSG Lumdatal (LL)",
          home: "TSF Heuchelheim 1",
          away: "HSG Lumdatal e.V. 1",
          location: "Sporthalle Heuchelheim",
          locationId: 30402,
        },
      ],
      ...overrides,
    },
  ]);
}

describe("parseRundenspielJson", () => {
  it("parst ein gültiges nuLiga-Export-Array", () => {
    const { ereignisse, fehler } = parseRundenspielJson(beispielJson());
    expect(fehler).toHaveLength(0);
    expect(ereignisse).toHaveLength(1);
    expect(ereignisse[0]).toMatchObject({
      ort: "Sporthalle Heuchelheim",
      beschreibung:
        "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel/Turnier",
      heimMannschaft: "TSF Heuchelheim 1",
      auswaertsMannschaft: "HSG Lumdatal e.V. 1",
    });
    expect(ereignisse[0].start.toISOString()).toBe(
      new Date("2026-08-02T15:00:00+02:00").toISOString()
    );
  });

  it("kennzeichnet echte Pflichtspiele (Spielnummer != 0) als Ligaspiel statt Freundschaftsspiel/Turnier", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "x",
            gameNumber: "42",
            home: "TSF Heuchelheim 1",
            away: "HSG Lumdatal e.V. 1",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
          },
        ],
      })
    );
    expect(ereignisse[0].beschreibung).toContain("Ligaspiel Nr. 42");
  });

  it("bildet dieselbe UID bei erneutem Parsen desselben Spiels (Re-Import-Erkennung)", () => {
    const erster = parseRundenspielJson(beispielJson());
    const zweiter = parseRundenspielJson(beispielJson());
    expect(erster.ereignisse[0].uid).toBe(zweiter.ereignisse[0].uid);
  });

  it("bildet unterschiedliche UIDs für unterschiedliche Hallen bei sonst gleichen Spieldaten", () => {
    const a = parseRundenspielJson(beispielJson());
    const b = parseRundenspielJson(
      beispielJson({ location: { id: 99999, name: "Andere Halle" } })
    );
    expect(a.ereignisse[0].uid).not.toBe(b.ereignisse[0].uid);
  });

  it("verarbeitet mehrere Hallen-Blöcke in einem Export", () => {
    const daten = JSON.parse(beispielJson());
    const zweiterBlock = JSON.parse(
      beispielJson({
        location: { id: 1, name: "Halle 2" },
        events: [
          {
            date: "2026-08-03",
            time: "10:00",
            start: "2026-08-03T10:00:00+02:00",
            title: "Anderes Spiel",
            home: "Verein C",
            away: "Verein D",
            location: "Halle 2",
            locationId: 1,
          },
        ],
      })
    )[0];
    const { ereignisse } = parseRundenspielJson(
      JSON.stringify([...daten, zweiterBlock])
    );
    expect(ereignisse).toHaveLength(2);
    expect(new Set(ereignisse.map((e) => e.ort)).size).toBe(2);
  });

  it("meldet einen Fehler für ein Spiel ohne verwertbares Startdatum, überspringt es aber", () => {
    const { ereignisse, fehler } = parseRundenspielJson(
      beispielJson({
        events: [{ title: "Kaputtes Spiel", home: "A", away: "B" }],
      })
    );
    expect(ereignisse).toHaveLength(0);
    expect(fehler).toHaveLength(1);
  });

  it("wirft bei kaputtem JSON eine verständliche Fehlermeldung", () => {
    expect(() => parseRundenspielJson("{ nicht valide")).toThrow();
  });

  it("wirft, wenn die oberste Ebene kein Array ist", () => {
    expect(() => parseRundenspielJson('{"foo": "bar"}')).toThrow();
  });

  it("unterscheidet zwei verschiedene Begegnungen mit gleichem Platzhalter-Zeitpunkt anhand der gameNumber", () => {
    // Beobachtet im echten nuLiga-Export: zwei unterschiedliche Jugend-
    // Jahrgänge derselben Vereine, beide noch ohne feste Uhrzeit (00:00).
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-11-21",
            time: "00:00",
            start: "2026-11-21T00:00:00+02:00",
            title: "A – B",
            gameNumber: "23",
            home: "mJSG Heuchelheim/Bieber",
            away: "HSG Linden",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
          },
          {
            date: "2026-11-21",
            time: "00:00",
            start: "2026-11-21T00:00:00+02:00",
            title: "A – B",
            gameNumber: "40",
            home: "mJSG Heuchelheim/Bieber",
            away: "HSG Linden",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
          },
        ],
      })
    );
    expect(ereignisse).toHaveLength(2);
    expect(ereignisse[0].uid).not.toBe(ereignisse[1].uid);
  });

  it("erkennt eine Terminverlegung (gleiche gameNumber, neues Datum/Uhrzeit) als dasselbe Spiel", () => {
    const vorher = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "x",
            gameNumber: "17",
            home: "TSF Heuchelheim 1",
            away: "HSG Lumdatal e.V. 1",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
          },
        ],
      })
    );
    const nachher = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-16",
            time: "18:00",
            start: "2026-08-16T18:00:00+02:00",
            title: "x",
            gameNumber: "17",
            home: "TSF Heuchelheim 1",
            away: "HSG Lumdatal e.V. 1",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
          },
        ],
      })
    );
    expect(nachher.ereignisse[0].uid).toBe(vorher.ereignisse[0].uid);
  });

  it("verlegte Freundschaftsspiele ohne gameNumber (Platzhalter '0') werden dagegen als neuer Eintrag erkannt", () => {
    // Ohne stabile Spielnummer gibt es keine bessere Grundlage — bekannte
    // Einschränkung, siehe Kommentar bei bildeUid.
    const vorher = parseRundenspielJson(beispielJson());
    const nachher = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-09",
            time: "17:00",
            start: "2026-08-09T17:00:00+02:00",
            title: "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1",
            gameNumber: "0",
            home: "TSF Heuchelheim 1",
            away: "HSG Lumdatal e.V. 1",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
          },
        ],
      })
    );
    expect(nachher.ereignisse[0].uid).not.toBe(vorher.ereignisse[0].uid);
  });
});

describe("findeMannschaft", () => {
  const mannschaften = [
    { id: "1", name: "Herren 1" },
    { id: "2", name: "Damen 1" },
  ];

  it("findet exakten Namens-Match", () => {
    const [{ ereignisse }] = [
      parseRundenspielJson(
        beispielJson({
          events: [
            {
              date: "2026-08-02",
              time: "15:00",
              start: "2026-08-02T15:00:00+02:00",
              title: "x",
              home: "Herren 1",
              away: "Gastverein 1",
              location: "Halle",
              locationId: 1,
            },
          ],
        })
      ),
    ];
    expect(findeMannschaft(ereignisse[0], mannschaften)).toBe("1");
  });

  it("findet eindeutigen Teilstring-Match im Heim-/Auswärtsnamen", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "x",
            home: "TSF Heuchelheim Herren 1",
            away: "Gastverein 1",
            location: "Halle",
            locationId: 1,
          },
        ],
      })
    );
    expect(findeMannschaft(ereignisse[0], mannschaften)).toBe("1");
  });

  it("liefert null, wenn keine Mannschaft passt", () => {
    const { ereignisse } = parseRundenspielJson(beispielJson());
    expect(findeMannschaft(ereignisse[0], mannschaften)).toBeNull();
  });

  it("findet die Mannschaft trotz unterschiedlicher Ziffern-Schreibweise (I vs. 1)", () => {
    const roemisch = [{ id: "1", name: "Herren I" }];
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "x",
            home: "Herren 1",
            away: "Gastverein 1",
            location: "Halle",
            locationId: 1,
          },
        ],
      })
    );
    expect(findeMannschaft(ereignisse[0], roemisch)).toBe("1");
  });
});

describe("normalisiereMannschaftsname", () => {
  it("wandelt römische in arabische Ziffern um", () => {
    expect(normalisiereMannschaftsname("Herren II")).toBe("herren 2");
    expect(normalisiereMannschaftsname("Damen III")).toBe("damen 3");
    expect(normalisiereMannschaftsname("Herren 2")).toBe("herren 2");
  });

  it("ist unempfindlich gegenüber Groß-/Kleinschreibung und doppelten Leerzeichen", () => {
    expect(normalisiereMannschaftsname("  TSF  Heuchelheim  ")).toBe(
      "tsf heuchelheim"
    );
  });
});

describe("gruppiereUnbekannteMannschaften", () => {
  it("gruppiert gleiche Mannschaft trotz unterschiedlicher Ziffern-Schreibweise", () => {
    const vorschlaege = gruppiereUnbekannteMannschaften([
      { heimMannschaftName: "TSF Heuchelheim II", mannschaftId: null },
      { heimMannschaftName: "TSF Heuchelheim 2", mannschaftId: null },
    ]);
    const heuchelheim = vorschlaege.find((v) => v.normalisiert === "tsf heuchelheim 2");
    expect(heuchelheim?.anzahlSpiele).toBe(2);
  });

  it("lässt bereits verknüpfte Termine aus", () => {
    const vorschlaege = gruppiereUnbekannteMannschaften([
      { heimMannschaftName: "Verknüpft", mannschaftId: "irgendeine-id" },
    ]);
    expect(vorschlaege).toHaveLength(0);
  });

  it("sortiert nach Häufigkeit absteigend", () => {
    const vorschlaege = gruppiereUnbekannteMannschaften([
      { heimMannschaftName: "Selten", mannschaftId: null },
      { heimMannschaftName: "Häufig", mannschaftId: null },
      { heimMannschaftName: "Häufig", mannschaftId: null },
    ]);
    expect(vorschlaege[0].anzeigeName).toBe("Häufig");
  });

  it("hält gleichnamige Mannschaften mit unterschiedlicher Kategorie auseinander", () => {
    // nuLiga liefert nicht immer einen unterscheidenden Nummern-Suffix im
    // Namen — Herren und eine Jugendmannschaft desselben Vereins könnten
    // sonst fälschlich als eine Mannschaft vorgeschlagen werden.
    const vorschlaege = gruppiereUnbekannteMannschaften([
      { heimMannschaftName: "HSG Musterstadt", mannschaftId: null, kategorie: "Mä/männl." },
      { heimMannschaftName: "HSG Musterstadt", mannschaftId: null, kategorie: "mJC" },
      { heimMannschaftName: "HSG Musterstadt", mannschaftId: null, kategorie: "Mä/männl." },
    ]);
    expect(vorschlaege).toHaveLength(2);
    const herren = vorschlaege.find((v) => v.kategorie === "Mä/männl.");
    const jugend = vorschlaege.find((v) => v.kategorie === "mJC");
    expect(herren?.anzahlSpiele).toBe(2);
    expect(jugend?.anzahlSpiele).toBe(1);
  });

  it("ignoriert Auswärtsnamen (immer ein fremder Verein, nicht relevant für eigene Mannschaften)", () => {
    // Die Funktion nimmt bewusst nur heimMannschaftName entgegen — ein
    // Auswärtsname kann hier gar nicht mehr übergeben werden, das ist Teil
    // des Vertrags, nicht nur ein Laufzeitverhalten.
    const vorschlaege = gruppiereUnbekannteMannschaften([
      { heimMannschaftName: "Eigene Mannschaft", mannschaftId: null },
    ]);
    expect(vorschlaege).toHaveLength(1);
    expect(vorschlaege[0].anzeigeName).toBe("Eigene Mannschaft");
  });
});
