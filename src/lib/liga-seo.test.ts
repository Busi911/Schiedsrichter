import { describe, expect, it } from "vitest";
import { berlinIso, jsonLdText, mannschaftJsonLd, spielAlsEvent, vereinJsonLd } from "./liga-seo";

const spiel = { id: "s1", datum: "2026-10-17", uhrzeit: "17:00", heimName: "HSG Linden", gastName: "TSG Leihgestern", halleName: "Stadthalle Linden", status: "geplant" };

describe("strukturierte Daten der Vereinsseiten", () => {
  it("Zeitpunkt in deutscher Zeit mit richtigem Sommer-/Winter-Offset", () => {
    expect(berlinIso("2026-10-17", "17:00")).toBe("2026-10-17T17:00:00+02:00");
    expect(berlinIso("2026-11-14", "9:30")).toBe("2026-11-14T09:30:00+01:00");
    expect(berlinIso("2026-11-14", null)).toBe("2026-11-14");
  });
  it("Spiel als SportsEvent: Ort nur mit Halle, abgesagt/verlegt als Status", () => {
    const e = spielAlsEvent(spiel, "https://x/spiel", "HSG Linden");
    expect(e.location).toEqual({ "@type": "Place", name: "Stadthalle Linden" });
    expect(e.eventStatus).toBe("https://schema.org/EventScheduled");
    expect("location" in spielAlsEvent({ ...spiel, halleName: null }, "u", "V")).toBe(false);
    expect(spielAlsEvent({ ...spiel, status: "abgesagt" }, "u", "V").eventStatus).toBe("https://schema.org/EventCancelled");
  });
  it("Verein und Mannschaft: Logo/Teams nur wenn vorhanden, höchstens 10 Spiele", () => {
    expect(vereinJsonLd({ name: "V", url: "u", logoUrl: null, mannschaften: [] })).not.toHaveProperty("logo");
    const v = vereinJsonLd({ name: "V", url: "u", logoUrl: "l", mannschaften: [{ name: "mC", url: "t" }] });
    expect(v.subOrganization).toHaveLength(1);
    const viele = Array.from({ length: 14 }, (_, i) => ({ ...spiel, id: `s${i}`, url: `u${i}` }));
    expect(mannschaftJsonLd({ vereinsName: "V", vereinsUrl: "u", name: "mC", liga: "Bezirksliga", url: "t", anstehend: viele }).event).toHaveLength(10);
  });
  it("maskiert < in JSON-LD", () => {
    expect(jsonLdText({ a: "</script>" })).not.toContain("</script>");
  });
});
