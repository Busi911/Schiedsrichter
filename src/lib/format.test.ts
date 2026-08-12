import { describe, expect, it } from "vitest";
import { berlinOffset, parseBerlinDatumZeit } from "./format";

describe("berlinOffset", () => {
  it("liefert +02:00 für ein Datum in der Sommerzeit", () => {
    expect(berlinOffset("2026-08-26")).toBe("+02:00");
  });

  it("liefert +01:00 für ein Datum in der Winterzeit", () => {
    expect(berlinOffset("2026-12-15")).toBe("+01:00");
  });
});

describe("parseBerlinDatumZeit", () => {
  it("interpretiert den Wert eines datetime-local-Inputs als Europe/Berlin-Zeit, nicht als Serverzeit", () => {
    // Regression: new Date("2026-08-26T19:45") ohne Zeitzonen-Behandlung
    // würde auf einem UTC-Server (Vercel) als 19:45 UTC interpretiert und
    // damit 2h zu spät (21:45 Berlin) gespeichert.
    const d = parseBerlinDatumZeit("2026-08-26T19:45");
    expect(d.toISOString()).toBe(new Date("2026-08-26T19:45:00+02:00").toISOString());
  });

  it("berücksichtigt die Winterzeit (MEZ, +01:00)", () => {
    const d = parseBerlinDatumZeit("2026-12-15T18:00");
    expect(d.toISOString()).toBe(new Date("2026-12-15T18:00:00+01:00").toISOString());
  });

  it("kommt auch mit Sekunden im Wert zurecht", () => {
    const d = parseBerlinDatumZeit("2026-08-26T19:45:30");
    expect(d.toISOString()).toBe(new Date("2026-08-26T19:45:30+02:00").toISOString());
  });

  it("fällt auf Mitternacht zurück, wenn kein Zeitanteil übergeben wird", () => {
    const d = parseBerlinDatumZeit("2026-08-26");
    expect(d.toISOString()).toBe(new Date("2026-08-26T00:00:00+02:00").toISOString());
  });
});
