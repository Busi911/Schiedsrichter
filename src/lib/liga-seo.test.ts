import { describe, expect, it } from "vitest";
import { berlinIso, breadcrumbJsonLd, jsonLdText, kuerzeBeschreibung, mannschaftJsonLd, spielAlsEvent, vereinJsonLd } from "./liga-seo";

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

describe("Brotkrumen und Beschreibungen", () => {
  it("BreadcrumbList: Positionen ab 1, absolute URLs in der übergebenen Reihenfolge", () => {
    const b = breadcrumbJsonLd([
      { name: "Vereine", url: "https://x/verein" },
      { name: "HSG Linden", url: "https://x/verein/hsg-linden" },
    ]);
    expect(b["@type"]).toBe("BreadcrumbList");
    expect(b.itemListElement.map((e) => e.position)).toEqual([1, 2]);
    expect(b.itemListElement[1]).toMatchObject({ name: "HSG Linden", item: "https://x/verein/hsg-linden" });
  });
  it("Beschreibung wird an einer Wortgrenze gekürzt, kurze bleiben unverändert", () => {
    expect(kuerzeBeschreibung("Kurz.")).toBe("Kurz.");
    const lang = "Spielplan Ergebnisse und Tabellen ".repeat(10);
    const k = kuerzeBeschreibung(lang);
    expect(k.length).toBeLessThanOrEqual(155);
    expect(k.endsWith("…")).toBe(true);
    expect(k).not.toMatch(/\s…$/);
  });
});
