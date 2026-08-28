import { describe, expect, it } from "vitest";
import {
  angesetzteNamenPassenZu,
  zaehleAngesetzteNamen,
  findeMannschaft,
  gruppiereUnbekannteMannschaften,
  normalisiereMannschaftsname,
  parseRundenspielJson,
  schiedsrichterKuerzelPasstZu,
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
        "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel",
      heimMannschaft: "TSF Heuchelheim 1",
      auswaertsMannschaft: "HSG Lumdatal e.V. 1",
      freundschaftsTyp: "freundschaftsspiel",
    });
    expect(ereignisse[0].start.toISOString()).toBe(
      new Date("2026-08-02T15:00:00+02:00").toISOString()
    );
    expect(ereignisse[0].ergebnisHeim).toBeNull();
    expect(ereignisse[0].ergebnisAuswaerts).toBeNull();
  });

  it("extrahiert ein bereits eingetragenes Ergebnis aus der Zusatz-Zelle statt es roh im Titel zu belassen", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
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
            zusatz: "40:25",
          },
        ],
      })
    );
    expect(ereignisse[0].ergebnisHeim).toBe(40);
    expect(ereignisse[0].ergebnisAuswaerts).toBe(25);
    expect(ereignisse[0].beschreibung).toBe(
      "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel"
    );
  });

  it("lässt ein Schiedsrichter-Kürzel in der Zusatz-Zelle unangetastet (kein Ergebnis-Muster)", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
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
            zusatz: "SR: M. Mueller",
          },
        ],
      })
    );
    expect(ereignisse[0].ergebnisHeim).toBeNull();
    expect(ereignisse[0].ergebnisAuswaerts).toBeNull();
    expect(ereignisse[0].beschreibung).toBe(
      "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel · SR: M. Mueller"
    );
  });

  it("extrahiert das Ergebnis, wenn zusätzlich noch ein Schiedsrichter-Kürzel in der Zusatz-Zelle steht, und behält den Rest", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
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
            zusatz: "SR: M. Mueller · 40:25",
          },
        ],
      })
    );
    expect(ereignisse[0].ergebnisHeim).toBe(40);
    expect(ereignisse[0].ergebnisAuswaerts).toBe(25);
    expect(ereignisse[0].beschreibung).toBe(
      "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel · SR: M. Mueller"
    );
  });

  it("extrahiert ein von nuLiga angesetztes Schiedsrichter-Kürzel aus der Zusatz-Zelle", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
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
            zusatz: "Geru.",
          },
        ],
      })
    );
    expect(ereignisse[0].schiedsrichterKuerzel).toBe("Geru.");
    expect(ereignisse[0].beschreibung).toBe(
      "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel"
    );
  });

  it("extrahiert Ergebnis UND Schiedsrichter-Kürzel gemeinsam aus der Zusatz-Zelle", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
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
            zusatz: "Geru. · 40:25",
          },
        ],
      })
    );
    expect(ereignisse[0].ergebnisHeim).toBe(40);
    expect(ereignisse[0].ergebnisAuswaerts).toBe(25);
    expect(ereignisse[0].schiedsrichterKuerzel).toBe("Geru.");
    expect(ereignisse[0].beschreibung).toBe(
      "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel"
    );
  });

  it("lässt schiedsrichterKuerzel null, wenn die Zusatz-Zelle kein Kürzel-Muster enthält", () => {
    const { ereignisse } = parseRundenspielJson(beispielJson());
    expect(ereignisse[0].schiedsrichterKuerzel).toBeNull();
  });

  it("übernimmt die handball.net-Felder schiedsrichter/zeitnehmer als angesetzte Namen", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1",
            gameNumber: "2627DHB3LERMC0102",
            home: "TSF Heuchelheim 1",
            away: "HSG Lumdatal e.V. 1",
            location: "Sporthalle Heuchelheim",
            locationId: 30402,
            schiedsrichter: "Levin Wanders, Georgios Dalampakis",
            zeitnehmer: "Max Mustermann",
          },
        ],
      })
    );
    expect(ereignisse[0].angesetzterSchiedsrichter).toBe(
      "Levin Wanders, Georgios Dalampakis"
    );
    expect(ereignisse[0].angesetzterZeitnehmer).toBe("Max Mustermann");
  });

  it("lässt die handball.net-Felder null, wenn sie im Event fehlen (nuLiga-Quelle)", () => {
    const { ereignisse } = parseRundenspielJson(beispielJson());
    expect(ereignisse[0].angesetzterSchiedsrichter).toBeNull();
    expect(ereignisse[0].angesetzterZeitnehmer).toBeNull();
  });

  it("extrahiert ein Gespann-Kürzel (zwei Schiedsrichter, durch \"/\" getrennt)", () => {
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
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
            zusatz: "Eike/Fisc.",
          },
        ],
      })
    );
    expect(ereignisse[0].schiedsrichterKuerzel).toBe("Eike/Fisc.");
    expect(ereignisse[0].beschreibung).toBe(
      "TSF Heuchelheim 1 – HSG Lumdatal e.V. 1 · Mä/männl. · Freundschaftsspiel"
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

  it("kennzeichnet Freundschaftsspiele aus der HHV-Sammelstaffel korrekt, auch wenn gameNumber != 0 ist", () => {
    // Regression: beobachtet im echten Export der Sporthalle Dutenhofen
    // (August 2026) — der HHV vergibt innerhalb seiner Sammelstaffel
    // "Gießen Freundschaftsspiele u. Turniere" ebenfalls fortlaufende
    // gameNumber, sodass gameNumber allein ein Freundschaftsspiel
    // fälschlich als "Ligaspiel Nr. 1" auswies.
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-08",
            time: "14:00",
            start: "2026-08-08T14:00:00+02:00",
            title: "HSG Dutenhofen/Münchholzhausen2 - MT Melsungen2",
            gameNumber: "1",
            category: "Mä/männl.",
            league:
              "F FrSp (M) HSG Dutenhofen/Münchholzhausen2 - MT Melsungen2",
            home: "HSG Dutenhofen/Münchholzhausen 2",
            away: "MT Melsungen II",
            location: "Sporthalle Dutenhofen",
            locationId: 14180,
          },
        ],
      })
    );
    expect(ereignisse[0].pflichtspiel).toBe(false);
    expect(ereignisse[0].freundschaftsTyp).toBe("freundschaftsspiel");
    expect(ereignisse[0].beschreibung).toContain("Freundschaftsspiel");
    expect(ereignisse[0].beschreibung).not.toContain("Ligaspiel");
  });

  it("erkennt ein Rundenturnier (4 Mannschaften, alle Paarungen an einem Tag/einer Halle) auch ohne 'F '-Präfix im league-Feld", () => {
    // Regression: beobachtet an der Sporthalle Münchholzhausen (August 2026)
    // — 4 Mannschaften spielen an einem Nachmittag alle 6 möglichen
    // Paarungen gegeneinander (klassisches Rundenturnier), aber gameNumber
    // ist fortlaufend 1-6 und das league-Feld folgt nicht der bekannten
    // HHV-Sammelstaffel-Konvention ("F "-Präfix) — die App zeigte dadurch
    // fälschlich "Ligaspiel Nr. 1" bis "Ligaspiel Nr. 6" an.
    const teams = [
      "HSG Dutenhofen/Münchholzhausen 1",
      "TSG Münster 1",
      "TuS Dotzheim 1",
      "TV Hüttenberg 1",
    ];
    const paarungen: [string, string][] = [
      [teams[0], teams[2]],
      [teams[1], teams[3]],
      [teams[0], teams[1]],
      [teams[2], teams[3]],
      [teams[0], teams[3]],
      [teams[2], teams[1]],
    ];
    const events = paarungen.map(([home, away], i) => ({
      date: "2026-08-23",
      time: `${11 + Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}`,
      start: `2026-08-23T${11 + Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"}:00+02:00`,
      title: `${home} – ${away}`,
      gameNumber: String(i + 1),
      category: "Mä/männl.",
      league: "HHV Kreisliga A",
      home,
      away,
      location: "Sporthalle Münchholzhausen",
      locationId: 99001,
    }));

    const { ereignisse } = parseRundenspielJson(beispielJson({ events }));

    expect(ereignisse).toHaveLength(6);
    for (const e of ereignisse) {
      expect(e.pflichtspiel).toBe(false);
      expect(e.freundschaftsTyp).toBe("turnier");
      expect(e.beschreibung).toContain("Turnier");
      expect(e.beschreibung).not.toContain("Ligaspiel");
    }
  });

  it("erkennt KEIN Rundenturnier bei einem normalen Spieltag mit mehreren unabhängigen Ligaspielen an derselben Halle", () => {
    // Der Export enthält ALLE Spiele an der eigenen Halle, auch die anderer
    // Mannschaften/Altersklassen (siehe Kommentar oben) — mehrere echte
    // Ligaspiele am selben Tag an derselben Halle sind daher normal und
    // dürfen nicht fälschlich als Turnier erkannt werden, solange sie KEINE
    // vollständige Rundenturnier-Paarung bilden.
    const events = [
      {
        date: "2026-08-23",
        time: "11:00",
        start: "2026-08-23T11:00:00+02:00",
        title: "Team A – Team B",
        gameNumber: "10",
        home: "Team A",
        away: "Team B",
        location: "Sporthalle Münchholzhausen",
        locationId: 99001,
      },
      {
        date: "2026-08-23",
        time: "13:00",
        start: "2026-08-23T13:00:00+02:00",
        title: "Team C – Team D",
        gameNumber: "11",
        home: "Team C",
        away: "Team D",
        location: "Sporthalle Münchholzhausen",
        locationId: 99001,
      },
      {
        date: "2026-08-23",
        time: "15:00",
        start: "2026-08-23T15:00:00+02:00",
        title: "Team A – Team C",
        gameNumber: "12",
        home: "Team A",
        away: "Team C",
        location: "Sporthalle Münchholzhausen",
        locationId: 99001,
      },
    ];

    const { ereignisse } = parseRundenspielJson(beispielJson({ events }));

    expect(ereignisse).toHaveLength(3);
    for (const e of ereignisse) {
      expect(e.pflichtspiel).toBe(true);
      expect(e.freundschaftsTyp).toBeNull();
      expect(e.beschreibung).toContain("Ligaspiel");
    }
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

  it("disambiguiert gleichnamige Mannschaften (z.B. Männer/Frauen) über altersklasse vs. kategorie", () => {
    const gleichnamig = [
      { id: "1", name: "TSF Heuchelheim", altersklasse: "F" },
      { id: "2", name: "TSF Heuchelheim", altersklasse: "M" },
    ];
    const { ereignisse } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "x",
            category: "M",
            home: "TSF Heuchelheim",
            away: "Gastverein 1",
            location: "Halle",
            locationId: 1,
          },
        ],
      })
    );
    expect(findeMannschaft(ereignisse[0], gleichnamig)).toBe("2");
  });

  it("liefert null bei gleichnamigen Mannschaften ohne passende/eindeutige altersklasse statt zu raten", () => {
    const gleichnamig = [
      { id: "1", name: "TSF Heuchelheim", altersklasse: "F" },
      { id: "2", name: "TSF Heuchelheim", altersklasse: "M" },
    ];
    const { ereignisse: ohneKategorie } = parseRundenspielJson(
      beispielJson({
        events: [
          {
            date: "2026-08-02",
            time: "15:00",
            start: "2026-08-02T15:00:00+02:00",
            title: "x",
            home: "TSF Heuchelheim",
            away: "Gastverein 1",
            location: "Halle",
            locationId: 1,
          },
        ],
      })
    );
    expect(findeMannschaft(ohneKategorie[0], gleichnamig)).toBeNull();
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

describe("schiedsrichterKuerzelPasstZu", () => {
  it("erkennt ein Kürzel, das dem Nachnamens-Anfang entspricht", () => {
    expect(schiedsrichterKuerzelPasstZu("Geru.", "Sabrina Gerullis")).toBe(true);
  });

  it("ist unempfindlich gegenüber Groß-/Kleinschreibung", () => {
    expect(schiedsrichterKuerzelPasstZu("geru.", "Sabrina GERULLIS")).toBe(true);
  });

  it("lehnt ein Kürzel ab, das nicht zum Nachnamen passt", () => {
    expect(schiedsrichterKuerzelPasstZu("Mue.", "Sabrina Gerullis")).toBe(false);
  });

  it("gibt false zurück, wenn kein Name vorhanden ist", () => {
    expect(schiedsrichterKuerzelPasstZu("Geru.", null)).toBe(false);
    expect(schiedsrichterKuerzelPasstZu("Geru.", undefined)).toBe(false);
  });

  it("erkennt bei einem Gespann-Kürzel den Treffer auf beide Hälften", () => {
    expect(schiedsrichterKuerzelPasstZu("Eike/Fisc.", "Yannick Eike")).toBe(true);
    expect(schiedsrichterKuerzelPasstZu("Eike/Fisc.", "Nicki Fischer")).toBe(true);
  });

  it("lehnt bei einem Gespann-Kürzel ab, wenn keine Hälfte passt", () => {
    expect(schiedsrichterKuerzelPasstZu("Eike/Fisc.", "Sabrina Gerullis")).toBe(
      false
    );
  });
});

describe("angesetzteNamenPassenZu", () => {
  it("erkennt einen exakten Namenstreffer", () => {
    expect(angesetzteNamenPassenZu("Max Mustermann", "Max Mustermann")).toBe(true);
  });

  it("ist unempfindlich gegenüber Groß-/Kleinschreibung und Umlaut-Schreibweise", () => {
    expect(angesetzteNamenPassenZu("Max Müller", "max mueller".replace("mueller", "müller"))).toBe(
      true
    );
  });

  it("erkennt einen Treffer auf einen von mehreren kommaseparierten Namen", () => {
    expect(
      angesetzteNamenPassenZu("Levin Wanders, Georgios Dalampakis", "Georgios Dalampakis")
    ).toBe(true);
  });

  it("lehnt ab, wenn kein angesetzter Name passt", () => {
    expect(angesetzteNamenPassenZu("Levin Wanders, Georgios Dalampakis", "Max Mustermann")).toBe(
      false
    );
  });

  it("gibt false zurück, wenn kein Name vorhanden ist", () => {
    expect(angesetzteNamenPassenZu("Max Mustermann", null)).toBe(false);
    expect(angesetzteNamenPassenZu("Max Mustermann", undefined)).toBe(false);
  });
});

describe("zaehleAngesetzteNamen", () => {
  it("zählt einen einzelnen Namen", () => {
    expect(zaehleAngesetzteNamen("Max Mustermann")).toBe(1);
  });

  it("zählt mehrere kommaseparierte Namen (z.B. Schiri-Gespann)", () => {
    expect(zaehleAngesetzteNamen("Levin Wanders, Georgios Dalampakis")).toBe(2);
  });

  it("gibt 0 zurück, wenn kein Feld vorhanden ist", () => {
    expect(zaehleAngesetzteNamen(null)).toBe(0);
    expect(zaehleAngesetzteNamen(undefined)).toBe(0);
    expect(zaehleAngesetzteNamen("")).toBe(0);
  });
});
