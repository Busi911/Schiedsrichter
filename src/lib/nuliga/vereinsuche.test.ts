import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseVereinsuche } from "./parsers/vereinsuche";
import { bereinigeHallenname, parseVereinsInfo } from "./parsers/vereinsinfo";
import { absoluteNuligaUrl, istErlaubteNuligaBildUrl } from "./verbaende";
import { entferneKontaktbereich } from "@/lib/bildtyp";

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
      hallenNummern: {},
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

describe("Hallen (eigener Abschnitt, keine Tabelle)", () => {
  it("sammelt die Hallenlinks unter der Überschrift und entfernt nur die abschließende Hallennummer", () => {
    const { daten, warnungen } = parseVereinsInfo(fixture("vereinsinfo-hallen.html"));
    expect(daten.hallen).toEqual([
      "Stadthalle Beispielstadt",
      "Sporthalle GS Beispielstadt",
      "Sporthalle Lützellinden",
      "Sph. Br.-Grimm-Schule Kl.-Beispielstadt",
    ]);
    expect(daten.hallenNummern["Stadthalle Beispielstadt"]).toBe("14151");
    expect(warnungen).toEqual([]);
    // Ansprechpartner-Abschnitt dahinter gehört nicht dazu
    expect(JSON.stringify(daten)).not.toMatch(/Mustermann|geheim/);
  });
  it("erkennt auch fette Überschrift mit <br>-Liste und reine Textzeilen", () => {
    const a = parseVereinsInfo(
      '<h1>X</h1><p><b>Hallen</b><br><a href="h1">Halle A (1)</a><br><a href="h2">Halle B (2)</a></p><h3>Andere</h3><a href="z">Nicht dabei</a>'
    ).daten;
    expect(a.hallen).toEqual(["Halle A", "Halle B"]);
    const b = parseVereinsInfo("<h1>X</h1><div><strong>Hallen:</strong><br>Halle A (1)<br>Halle B (2)<br></div>").daten;
    expect(b.hallen).toEqual(["Halle A", "Halle B"]);
  });
  it("nimmt Links ohne Nummer, aber nur bis zum Zeilenende der Tabelle", () => {
    const c = parseVereinsInfo(
      '<h1>X</h1><table><tr><td>Hallen</td><td><a href="h">Halle A</a><br><a href="h">Halle B</a></td></tr><tr><td>Stammvereine</td><td><a href="s">TV Fremd</a></td></tr></table>'
    ).daten;
    expect(c.hallen).toEqual(["Halle A", "Halle B"]);
  });
  it("warnt statt zu raten, wenn es keinen Hallenabschnitt gibt", () => {
    const r = parseVereinsInfo("<h1>X</h1><p>Hallenplan</p><a href='x'>Halle Z (9)</a>");
    expect(r.daten.hallen).toEqual([]);
    expect(r.warnungen.join()).toContain("Hallen");
  });
  it("bereinigeHallenname entfernt NUR eine abschließende Zahl in Klammern", () => {
    expect(bereinigeHallenname("Stadthalle Linden (14151)")).toEqual({ name: "Stadthalle Linden", nummer: "14151" });
    expect(bereinigeHallenname("Sph. Br.-Grimm-Schule Kl.-Linden (14185)").name).toBe("Sph. Br.-Grimm-Schule Kl.-Linden");
    expect(bereinigeHallenname("Sporthalle (Nord)").name).toBe("Sporthalle (Nord)");
    expect(bereinigeHallenname("Halle (alt) (12)")).toEqual({ name: "Halle (alt)", nummer: "12" });
    expect(bereinigeHallenname("Halle (12) Süd").name).toBe("Halle (12) Süd");
  });
});

// Aus der echten Diagnose (club=76446): Die <h1> trägt Verband UND Verein ("Hessischer Handball-Verband e.V. HSG Linden").
// Die Seitenstruktur für VNr./Gründungsjahr/Website ist NICHT bekannt — die Parser suchen deshalb über die Beschriftung im
// sichtbaren Text; die folgenden Varianten sind nachgebaute Möglichkeiten, keine Kopie der echten Seite.
describe("Stammdaten über Beschriftungen (TUS Vollnkirchen, club 54040)", () => {
  const erwartet = { name: "TUS Vollnkirchen", nummer: "14175", gruendung: 1965, website: "https://www.tus-vollnkirchen.de" };
  const kopf = '<h1>Hessischer Handball-Verband e.V.<br />TUS Vollnkirchen</h1>';
  const varianten: Record<string, string> = {
    tabelle: `${kopf}<table><tr><td>VNr.</td><td>14175</td></tr><tr><td>Gründungsjahr</td><td>1965</td></tr><tr><td>Website</td><td><a href="http://www.tus-vollnkirchen.de">www.tus-vollnkirchen.de</a></td></tr></table>`,
    definitionsliste: `${kopf}<dl><dt>VNr.</dt><dd>14175</dd><dt>Gründungsjahr</dt><dd>1965</dd><dt>Website</dt><dd><a href="https://www.tus-vollnkirchen.de/">www.tus-vollnkirchen.de</a></dd></dl>`,
    textzeilen: `${kopf}<p><b>VNr.</b> 14175<br /><b>Gründungsjahr:</b> 1965<br /><b>Website:</b> <a href="x">www.tus-vollnkirchen.de</a></p>`,
    ueberschrift: `<h1>Hessischer Handball-Verband e.V.<br />TUS Vollnkirchen</h1><h2>VNr. 14175</h2><div>Gründungsjahr 1965</div><div>Website www.tus-vollnkirchen.de</div>`,
  };
  for (const [titel, html] of Object.entries(varianten)) {
    it(`erkennt Name, VNr., Gründungsjahr und Website (${titel})`, () => {
      const { daten } = parseVereinsInfo(html);
      expect(daten.name).toBe(erwartet.name);
      expect(daten.nummer).toBe(erwartet.nummer);
      expect(daten.gruendung).toBe(erwartet.gruendung);
      expect(daten.website?.replace(/\/$/, "")).toBe(erwartet.website.replace("https://", daten.website?.startsWith("http://") ? "http://" : "https://"));
    });
  }
  it("nimmt bei einer einzeiligen <h1> diese Zeile und ignoriert nuLiga-eigene Adressen als Website", () => {
    const { daten } = parseVereinsInfo("<h1>HSG Linden</h1><p>Website www.hhv-handball.liga.nu</p>");
    expect(daten.name).toBe("HSG Linden");
    expect(daten.website).toBeNull();
  });
  it("findet bei fehlenden Angaben nichts (kein Raten)", () => {
    const { daten } = parseVereinsInfo("<h1>X</h1><p>Telefon 0641 123456</p>");
    expect([daten.nummer, daten.gruendung, daten.website]).toEqual([null, null, null]);
  });
});

describe("Echte Struktur (club=76446): ein Absatz mit VNr., Gründungsjahr und Stammvereinen", () => {
  const { daten, warnungen } = parseVereinsInfo(fixture("vereinsinfo-linden.html"));
  it("liest alles, was die Seite zeigt", () => {
    expect(daten).toMatchObject({
      name: "HSG Linden",
      nummer: "14194",
      gruendung: 2019,
      stammvereine: ["TV Großen-Linden", "TSV Klein-Linden", "TSV 2006 Lützellinden"],
      hallen: ["Stadthalle Linden", "Sporthalle GS Linden", "Sporthalle Lützellinden", "Sph. Br.-Grimm-Schule Kl.-Linden"],
      logoPfad: "/cgi-bin/WebObjects/nuLigaHBDE.woa/wr?wodata=214535274107372611",
      logoSicher: true,
    });
    expect(daten.hallenNummern["Stadthalle Linden"]).toBe("14151");
    // HSG Linden zeigt keine Website: kein Raten
    expect(daten.website).toBeNull();
    expect(warnungen).toEqual([]);
  });
  it("übernimmt nichts aus dem Kontaktbereich", () => {
    expect(JSON.stringify(daten)).not.toMatch(/Mustermann|Beispielstra|0641|geheim/);
  });
  it("findet eine Website auch ohne Beschriftung als externen Link im Stammdaten-Absatz", () => {
    const mit = fixture("vereinsinfo-linden.html").replace("Stammvereine:", '<a href="http://www.tus-vollnkirchen.de/">www.tus-vollnkirchen.de</a><br />Stammvereine:');
    expect(parseVereinsInfo(mit).daten.website).toBe("http://www.tus-vollnkirchen.de");
    // Links innerhalb von nuLiga (z.B. die Hallen) sind nie die Website
    expect(parseVereinsInfo(fixture("vereinsinfo-linden.html")).daten.website).toBeNull();
  });
  it("die Diagnose entfernt den Kontaktbereich vollständig", () => {
    const sicher = entferneKontaktbereich(fixture("vereinsinfo-linden.html"));
    expect(sicher).not.toMatch(/Mustermann|Beispielstra|Tel\./);
    expect(sicher).toContain("Stadthalle Linden");
  });
});
