import { describe, expect, it } from "vitest";
import { baueHandballNetZeitraum, parseHandballNetMatch } from "./handball-net-scraper";

describe("baueHandballNetZeitraum", () => {
  it("baut ein rollierendes Fenster von Monatsanfang (rückwärts) bis Monatsende (vorwärts)", () => {
    const { von, bis } = baueHandballNetZeitraum(new Date("2026-08-22T00:00:00Z"), 10, 1);
    expect(von).toBe("2026-07-01");
    expect(bis).toBe("2027-06-30");
  });

  it("rollt über den Jahreswechsel korrekt", () => {
    const { von, bis } = baueHandballNetZeitraum(new Date("2026-12-20T00:00:00Z"), 1, 1);
    expect(von).toBe("2026-11-01");
    expect(bis).toBe("2027-01-31");
  });
});

// Gekürztes, aber strukturell echtes Beispiel (siehe
// https://www.handball.net/api/new/matches?team_id=69770&...), abgerufen für
// die exemplarische 3.-Liga-Mannschaft aus der Anfrage.
function beispielMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 414585,
    code: "2627DHB3LERMC0102",
    date: "2026-08-29T19:00:00+00:00",
    phase: {
      competition: { name: "3. Liga Männer" },
    },
    local: { id: 69770, name: "HSG DUTENHOFEN MÜNCHHOLZHAUSEN II" },
    visitor: { id: 87358, name: "HLZ FRIESENHEIM/HOCHDORF II" },
    result: { local: null, visitor: null },
    field: { name: "SPORTHALLE DUTENHOFEN", installation: { name: "SPORTHALLE DUTENHOFEN" } },
    referees: [
      { first_name: "Levin", last_name: "Wanders", role: { name: "SCHIEDSRICHTER" } },
      { first_name: "Georgios", last_name: "Dalampakis", role: { name: "SCHIEDSRICHTER" } },
    ],
    ...overrides,
  };
}

describe("parseHandballNetMatch", () => {
  it("parst ein Match in dieselbe Eventform wie parseNuligaSeite", () => {
    const event = parseHandballNetMatch(beispielMatch(), "69770");
    expect(event).toMatchObject({
      date: "2026-08-29",
      time: "19:00",
      start: "2026-08-29T19:00:00+02:00",
      title: "HSG DUTENHOFEN MÜNCHHOLZHAUSEN II – HLZ FRIESENHEIM/HOCHDORF II",
      gameNumber: "2627DHB3LERMC0102",
      league: "3. Liga Männer",
      home: "HSG DUTENHOFEN MÜNCHHOLZHAUSEN II",
      away: "HLZ FRIESENHEIM/HOCHDORF II",
      location: "SPORTHALLE DUTENHOFEN",
      locationId: "69770",
    });
  });

  it("verwendet MEZ (+01:00) statt MESZ für Spiele in der Winterzeit trotz konstantem '+00:00' im Rohdatum", () => {
    // Beobachtet an echten Exports: das Offset im Rohdatum bleibt "+00:00"
    // unabhängig von Sommer-/Winterzeit — also keine echte UTC-Zeit, siehe
    // Kommentar in parseSpielDatum.
    const event = parseHandballNetMatch(
      beispielMatch({ date: "2026-12-19T19:30:00+00:00" }),
      "69770"
    );
    expect(event?.start).toBe("2026-12-19T19:30:00+01:00");
  });

  it("extrahiert das Ergebnis als 'Zahl:Zahl'-Segment in zusatz, wenn das Spiel ausgetragen ist", () => {
    const event = parseHandballNetMatch(
      beispielMatch({ result: { local: 28, visitor: 24 } }),
      "69770"
    );
    expect(event?.zusatz).toContain("28:24");
  });

  it("liefert kein Ergebnis-Segment, solange das Spiel noch nicht ausgetragen ist", () => {
    const event = parseHandballNetMatch(beispielMatch(), "69770");
    expect(event?.zusatz ?? "").not.toMatch(/\d+:\d+/);
  });

  it("extrahiert Schiedsrichter mit vollem Namen in ein eigenes Feld statt in zusatz", () => {
    const event = parseHandballNetMatch(beispielMatch(), "69770");
    expect(event?.schiedsrichter).toBe("Levin Wanders, Georgios Dalampakis");
    expect(event?.zeitnehmer).toBeNull();
    expect(event?.zusatz).toBeNull();
  });

  it("ordnet Rollen ohne 'Schiedsrichter' im Namen dem Zeitnehmer/Sekretär-Feld zu", () => {
    const event = parseHandballNetMatch(
      beispielMatch({
        referees: [
          { first_name: "Levin", last_name: "Wanders", role: { name: "SCHIEDSRICHTER" } },
          { first_name: "Max", last_name: "Mustermann", role: { name: "ZEITNEHMER" } },
          { first_name: "Erika", last_name: "Musterfrau", role: { name: "SEKRETAER" } },
        ],
      }),
      "69770"
    );
    expect(event?.schiedsrichter).toBe("Levin Wanders");
    expect(event?.zeitnehmer).toBe("Max Mustermann, Erika Musterfrau");
  });

  it("fällt bei fehlender Hallen-Angabe auf den Heimmannschaftsnamen zurück", () => {
    const event = parseHandballNetMatch(beispielMatch({ field: null }), "69770");
    expect(event?.location).toBe("HSG DUTENHOFEN MÜNCHHOLZHAUSEN II");
  });

  it("liefert null bei fehlendem/ungültigem Datum", () => {
    expect(parseHandballNetMatch(beispielMatch({ date: null }), "69770")).toBeNull();
  });

  it("liefert null, wenn Heim- oder Auswärtsname fehlt", () => {
    expect(parseHandballNetMatch(beispielMatch({ local: {} }), "69770")).toBeNull();
  });
});
