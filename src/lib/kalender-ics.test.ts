import { describe, expect, it } from "vitest";
import { generiereIcsFeed, type IcsTermin } from "./kalender-ics";

function termin(overrides: Partial<IcsTermin> = {}): IcsTermin {
  return {
    id: "abc-123",
    start: new Date("2026-09-01T18:00:00+02:00"),
    ende: null,
    ort: "Halle 1",
    titel: "Zeitnehmer: Ligaspiel TSF Heuchelheim (M)",
    ...overrides,
  };
}

describe("generiereIcsFeed", () => {
  it("enthält BEGIN/END VCALENDAR und ein VEVENT pro Termin", () => {
    const feed = generiereIcsFeed("TSF Heuchelheim", [termin(), termin({ id: "def-456" })]);
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("END:VCALENDAR");
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("nutzt eine Standarddauer von 2 Stunden, wenn kein Ende erfasst ist", () => {
    const feed = generiereIcsFeed("Verein", [
      termin({ start: new Date("2026-09-01T18:00:00Z"), ende: null }),
    ]);
    expect(feed).toContain("DTSTART:20260901T180000Z");
    expect(feed).toContain("DTEND:20260901T200000Z");
  });

  it("nutzt das erfasste Ende, wenn vorhanden", () => {
    const feed = generiereIcsFeed("Verein", [
      termin({
        start: new Date("2026-09-01T18:00:00Z"),
        ende: new Date("2026-09-01T19:30:00Z"),
      }),
    ]);
    expect(feed).toContain("DTEND:20260901T193000Z");
  });

  it("escaped Sonderzeichen in SUMMARY/LOCATION", () => {
    const feed = generiereIcsFeed("Verein", [
      termin({ titel: "Spiel; Nachholtermin, verschoben", ort: "Halle, Nebenraum" }),
    ]);
    expect(feed).toContain("SUMMARY:Spiel\\; Nachholtermin\\, verschoben");
    expect(feed).toContain("LOCATION:Halle\\, Nebenraum");
  });

  it("lässt LOCATION weg, wenn kein Ort erfasst ist", () => {
    const feed = generiereIcsFeed("Verein", [termin({ ort: null })]);
    expect(feed).not.toContain("LOCATION:");
  });

  it("faltet Zeilen, die länger als 75 Zeichen sind", () => {
    const feed = generiereIcsFeed("Verein", [
      termin({ titel: "X".repeat(120) }),
    ]);
    const summaryZeilen = feed
      .split("\r\n")
      .filter((z) => z.startsWith("SUMMARY:") || z.startsWith(" X"));
    expect(summaryZeilen.length).toBeGreaterThan(1);
    expect(summaryZeilen.every((z) => z.length <= 75)).toBe(true);
  });
});
