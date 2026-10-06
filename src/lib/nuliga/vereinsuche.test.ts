import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVereinsuche } from "./parsers/vereinsuche";
import { parseVereinsInfo } from "./parsers/vereinsinfo";
import { absoluteNuligaUrl, istErlaubteNuligaBildUrl } from "./verbaende";

// ACHTUNG: Die Fixtures sind nach Beschreibung NACHGEBAUT (kein Zugriff auf die echte Seite) —
// sie belegen die Logik, nicht, dass nuLiga genau so aussieht.
const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", n), "utf8");

describe("parseVereinsuche", () => {
  const { daten, warnungen } = parseVereinsuche(fixture("vereinsuche-bezirk.html"), "Gießen");
  it("trennt interne club-ID und sichtbare Vereinsnummer", () => {
    const linden = daten.vereine.find((v) => v.name === "HSG Linden");
    expect(linden).toEqual({ clubId: "76446", name: "HSG Linden", nummer: "14194", bezirk: "Gießen" });
    // Klammerzahl ist nie die club-ID
    expect(daten.vereine.find((v) => v.clubId === "14194")).toBeUndefined();
  });
  it("liest Nummer auch aus einer Nachbarzelle, Umlaute", () => {
    expect(daten.vereine.find((v) => v.clubId === "11111")).toMatchObject({ name: "SG Münster/Grün", nummer: "20202" });
  });
  it("findet die Bezirke und warnt bei leerer Seite", () => {
    expect(daten.regionen.map((r) => r.name)).toEqual(["Gießen", "Kassel"]);
    expect(daten.regionen[0].searchPattern).toBe("DE.SW.02.03");
    expect(warnungen).toEqual([]);
    expect(parseVereinsuche("<html></html>").warnungen).toHaveLength(1);
  });
});

describe("parseVereinsInfo", () => {
  const { daten } = parseVereinsInfo(fixture("vereinsinfo.html"));
  it("liest Stammdaten, Stammvereine und Hallen", () => {
    expect(daten).toEqual({
      name: "HSG Linden",
      nummer: "14194",
      gruendung: 2019,
      website: "https://www.beispiel-hsg.invalid",
      stammvereine: ["TV Beispiel", "TSV Muster"],
      hallen: ["Sporthalle Nord", "Kreissporthalle"],
      logoPfad: "/cgi-bin/WebObjects/nuLigaHBDE.woa/wr?wodata=1111111111111111111",
      logoSicher: true,
    });
  });
  it("findet das Logo über den Bildtext, nicht über feste Positionen oder eine feste ID", () => {
    // Werbebanner (anderer alt-Text), Zählpixel und Symbole zählen nicht
    const ohneName = parseVereinsInfo(fixture("vereinsinfo.html").replace('alt="HSG Linden"', 'alt="Logo"')).daten;
    expect(ohneName.logoPfad).toBeNull(); // zwei unklare Kandidaten (Logo + Werbung) werden nicht geraten
    const einziges = parseVereinsInfo(
      '<h1>TV Test</h1><img src="/cgi-bin/x.woa/wr?wodata=5" alt="" />'
    ).daten;
    expect(einziges).toMatchObject({ logoPfad: "/cgi-bin/x.woa/wr?wodata=5", logoSicher: false });
    expect(parseVereinsInfo("<h1>TV Test</h1><p>kein Bild</p>").daten.logoPfad).toBeNull();
  });
  it("übernimmt keine Kontaktdaten", () => {
    const json = JSON.stringify(daten);
    for (const p of ["GEHEIM", "Mustermann", "@"]) expect(json).not.toContain(p);
  });
});

describe("Bild-URLs (SSRF-Schutz)", () => {
  it("macht relative Pfade absolut und lässt nur freigegebene nuLiga-Hosts zu", () => {
    const url = absoluteNuligaUrl("HHV", "/cgi-bin/WebObjects/nuLigaHBDE.woa/wr?wodata=1");
    expect(url).toBe("https://hhv-handball.liga.nu/cgi-bin/WebObjects/nuLigaHBDE.woa/wr?wodata=1");
    expect(istErlaubteNuligaBildUrl(url)).toBe(true);
    for (const boese of [
      "http://hhv-handball.liga.nu/cgi-bin/x.woa/wr?wodata=1",
      "https://evil.example/cgi-bin/x.woa/wr?wodata=1",
      "https://hhv-handball.liga.nu.evil.example/x/wr?wodata=1",
      "https://user@hhv-handball.liga.nu/x/wr?wodata=1",
      "https://hhv-handball.liga.nu:8443/x/wr?wodata=1",
      "https://hhv-handball.liga.nu/x/admin?wodata=1",
      "https://hhv-handball.liga.nu/x/wr",
      "https://127.0.0.1/x/wr?wodata=1",
      "not a url",
    ]) {
      expect(istErlaubteNuligaBildUrl(boese), boese).toBe(false);
    }
    // absoluter Fremd-Pfad bleibt fremd (new URL überschreibt den Host nicht stillschweigend)
    expect(istErlaubteNuligaBildUrl(absoluteNuligaUrl("HHV", "https://evil.example/x/wr?wodata=1"))).toBe(false);
  });
});
