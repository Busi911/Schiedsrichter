import { describe, expect, it } from "vitest";
import { baueMonatsUrls, parseNuligaSeite } from "./nuliga-scraper";

describe("baueMonatsUrls", () => {
  it("erzeugt pro Halle die angegebene Anzahl Monats-URLs, rollierend ab dem übergebenen Datum", () => {
    const urls = baueMonatsUrls(["30402"], 3, new Date("2026-11-15T00:00:00Z"), 0);
    expect(urls).toHaveLength(3);
    expect(urls.map((u) => u.requestedMonth)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("rollt über den Jahreswechsel korrekt", () => {
    const urls = baueMonatsUrls(["1"], 2, new Date("2026-12-20T00:00:00Z"), 0);
    expect(urls.map((u) => u.requestedMonth)).toEqual(["2026-12", "2027-01"]);
  });

  it("baut für jede Halle eine eigene URL-Serie", () => {
    const urls = baueMonatsUrls(["1", "2"], 1, new Date("2026-08-01T00:00:00Z"), 0);
    expect(urls.map((u) => u.locationId)).toEqual(["1", "2"]);
  });

  it("kodiert den Monatsnamen als URL-Parameter mit '+' statt Leerzeichen", () => {
    const [url] = baueMonatsUrls(["30402"], 1, new Date("2026-08-01T00:00:00Z"), 0);
    expect(url.url).toContain("month=August+2026");
    expect(url.url).toContain("location=30402");
    expect(url.url).toContain("federation=HHV");
  });

  it("nimmt standardmäßig zusätzlich einen Monat rückwärts mit, damit nachträgliche Änderungen/Ergebnisse nicht aus dem Sync-Fenster fallen", () => {
    const urls = baueMonatsUrls(["30402"], 3, new Date("2026-11-15T00:00:00Z"));
    expect(urls.map((u) => u.requestedMonth)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
    ]);
  });

  it("rollt beim Rückwärts-Monat über den Jahreswechsel korrekt", () => {
    const urls = baueMonatsUrls(["1"], 1, new Date("2027-01-05T00:00:00Z"));
    expect(urls.map((u) => u.requestedMonth)).toEqual(["2026-12", "2027-01"]);
  });
});

function beispielHtml() {
  return `
    <html>
      <body>
        <h1>Sporthalle Heuchelheim (30402)</h1>
        <table>
          <tr>
            <td>02.08.2026</td>
            <td>15:00</td>
            <td>0</td>
            <td>M&auml;/m&auml;nnl.</td>
            <td>F 2026-08-02 M TSF Heuchelheim (BOL) gg HSG Lumdatal (LL)</td>
            <td>TSF Heuchelheim 1</td>
            <td>HSG Lumdatal e.V. 1</td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

describe("parseNuligaSeite", () => {
  it("liest Hallennamen aus der Überschrift (ohne Hallen-ID-Suffix)", () => {
    const { locationName } = parseNuligaSeite(beispielHtml(), "30402");
    expect(locationName).toBe("Sporthalle Heuchelheim");
  });

  it("parst eine Tabellenzeile in ein Event", () => {
    const { events } = parseNuligaSeite(beispielHtml(), "30402");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: "2026-08-02",
      time: "15:00",
      start: "2026-08-02T15:00:00+02:00",
      gameNumber: "0",
      category: "Mä/männl.",
      home: "TSF Heuchelheim 1",
      away: "HSG Lumdatal e.V. 1",
      location: "Sporthalle Heuchelheim",
      locationId: "30402",
    });
  });

  it("liefert zusatz=null ohne weitere Zellen nach Heim/Auswärts", () => {
    const { events } = parseNuligaSeite(beispielHtml(), "30402");
    expect(events[0].zusatz).toBeNull();
  });

  it("reicht weitere Zellen nach Heim/Auswärts (z.B. Schiedsrichter-Kürzel) roh als zusatz durch", () => {
    const html = `
      <h1>Halle (1)</h1>
      <table>
        <tr>
          <td>02.08.2026</td>
          <td>15:00</td>
          <td>0</td>
          <td>Mä/männl.</td>
          <td>Liga</td>
          <td>Heim 1</td>
          <td>Gast 1</td>
          <td>SR: M. Mueller</td>
        </tr>
      </table>
    `;
    const { events } = parseNuligaSeite(html, "1");
    expect(events[0].zusatz).toBe("SR: M. Mueller");
  });

  it('überspringt eine Zeile, deren Zeit-Zelle ein angehängtes "x" trägt (ersetzter Rundenturnier-Platzhalter-Slot)', () => {
    // Reale nuLiga-Struktur (beobachtet im Hallenspielplan): das "x" landet
    // NICHT in einer eigenen Zelle, sondern direkt in derselben <td> wie die
    // Uhrzeit ("10:30&nbsp;x") — bei einer generierten Rundenturnier-
    // Platzhalter-Paarung, die durch ein individuell angesetztes
    // Freundschaftsspiel zur selben Zeit ersetzt wurde (hier: "F 2026-08-29
    // WJC HC Koblenz - TV Großwallstadt" statt der Platzhalter-Paarung "T
    // WJC TV Engers - TV Großwallstadt").
    const html = `
      <h1>Halle (1)</h1>
      <table>
        <tr>
          <td>29.08.2026</td>
          <td nowrap="nowrap">
            10:30
            &nbsp;x
          &nbsp;</td>
          <td>0</td>
          <td>Fr/weibl.</td>
          <td>T WJC TV Engers - TV Großwallstadt</td>
          <td>TV Engers 1</td>
          <td>TV Großwallstadt Junioren 1</td>
        </tr>
        <tr>
          <td class="tabelle-rowspan">&nbsp;</td>
          <td nowrap="nowrap">10:30&nbsp;</td>
          <td>0</td>
          <td>Fr/weibl.</td>
          <td>F 2026-08-29 WJC HC Koblenz - TV Großwallstadt</td>
          <td>HC Koblenz 1</td>
          <td>TV Großwallstadt Junioren 1</td>
        </tr>
      </table>
    `;
    const { events } = parseNuligaSeite(html, "1");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      home: "HC Koblenz 1",
      away: "TV Großwallstadt Junioren 1",
    });
  });

  it("fällt auf einen generischen Namen zurück, wenn keine Überschrift gefunden wird", () => {
    const { locationName } = parseNuligaSeite("<html><body>leer</body></html>", "999");
    expect(locationName).toBe("nuLiga Halle 999");
  });

  it("ignoriert Zeilen ohne genug Zellen (z.B. Layout-Zeilen)", () => {
    const html = `<h1>Halle (1)</h1><table><tr><td>nur</td><td>zwei</td></tr></table>`;
    const { events } = parseNuligaSeite(html, "1");
    expect(events).toHaveLength(0);
  });

  it("verwendet MEZ (+01:00) statt MESZ für Termine in der Winterzeit", () => {
    // Das rollierende 10-Monats-Fenster reicht zwangsläufig auch in die
    // Wintermonate — ein fest verdrahtetes +02:00 (siehe Git-Historie)
    // hätte Winterspiele eine Stunde zu früh gespeichert.
    const html = `
      <h1>Halle (1)</h1>
      <table>
        <tr>
          <td>15.12.2026</td>
          <td>18:00</td>
          <td>0</td>
          <td>Mä/männl.</td>
          <td>Liga</td>
          <td>Heim 1</td>
          <td>Gast 1</td>
        </tr>
      </table>
    `;
    const { events } = parseNuligaSeite(html, "1");
    expect(events[0].start).toBe("2026-12-15T18:00:00+01:00");
  });
});
