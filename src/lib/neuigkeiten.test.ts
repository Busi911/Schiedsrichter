import { describe, expect, it } from "vitest";
import { absaetze, baueRssFeed, istVeroeffentlicht, kurztext, NEUIGKEIT_TEXT_MAX, NeuigkeitFehler, pruefeNeuigkeit, xmlEscape } from "./neuigkeiten";

describe("pruefeNeuigkeit", () => {
  it("trimmt und verlangt Titel und Text", () => {
    expect(pruefeNeuigkeit({ titel: "  Sieg  ", text: " Super Spiel \r\n\r\nZweiter Absatz " })).toEqual({ titel: "Sieg", text: "Super Spiel \n\nZweiter Absatz" });
    expect(() => pruefeNeuigkeit({ titel: " ", text: "x" })).toThrow(NeuigkeitFehler);
    expect(() => pruefeNeuigkeit({ titel: "x", text: "  " })).toThrow(NeuigkeitFehler);
  });
  it("begrenzt Länge", () => {
    expect(() => pruefeNeuigkeit({ titel: "a".repeat(121), text: "x" })).toThrow(/Titel/);
    expect(() => pruefeNeuigkeit({ titel: "x", text: "a".repeat(NEUIGKEIT_TEXT_MAX + 1) })).toThrow(/Text/);
  });
});

describe("Text-Helfer", () => {
  it("teilt in Absätze", () => {
    expect(absaetze("a\nb\n\n\nc\n\n  \nd")).toEqual(["a\nb", "c", "d"]);
  });
  it("kürzt am Wortende", () => {
    expect(kurztext("kurz")).toBe("kurz");
    const k = kurztext("wort ".repeat(100), 50);
    expect(k.endsWith("…")).toBe(true);
    expect(k.length).toBeLessThanOrEqual(51);
  });
  it("veröffentlicht erst mit erreichtem Zeitpunkt", () => {
    const jetzt = new Date("2026-11-04T12:00:00Z");
    expect(istVeroeffentlicht(null, jetzt)).toBe(false);
    expect(istVeroeffentlicht(new Date("2026-11-05T00:00:00Z"), jetzt)).toBe(false);
    expect(istVeroeffentlicht(new Date("2026-11-04T11:00:00Z"), jetzt)).toBe(true);
  });
});

describe("RSS-Feed", () => {
  it("escaped Sonderzeichen und Steuerzeichen", () => {
    expect(xmlEscape(`<a href="x">&'\u0001</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });
  it("baut gültiges RSS, neueste zuerst, höchstens 20, ohne HTML", () => {
    const eintraege = Array.from({ length: 25 }, (_, i) => ({
      id: `id-${i}`,
      titel: i === 24 ? "<script>alert(1)</script>" : `Titel ${i}`,
      text: "Text & mehr",
      datum: new Date(Date.UTC(2026, 9, 1 + i)),
      link: `https://x.test/verein/a/neuigkeiten#id-${i}`,
    }));
    const xml = baueRssFeed({ vereinName: "HSG Test", seitenUrl: "https://x.test/verein/a/neuigkeiten", feedUrl: "https://x.test/verein/a/feed.xml", eintraege });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect((xml.match(/<item>/g) ?? []).length).toBe(20);
    expect(xml.indexOf("&lt;script&gt;")).toBeLessThan(xml.indexOf("Titel 23"));
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("Text &amp; mehr");
    expect(xml).toContain('rel="self"');
  });
  it("funktioniert ohne Einträge", () => {
    const xml = baueRssFeed({ vereinName: "A", seitenUrl: "https://x.test/a", feedUrl: "https://x.test/a/feed.xml", eintraege: [] });
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
    expect(xml).not.toContain("lastBuildDate");
  });
});
