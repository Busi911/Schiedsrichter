import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { terminAlsExcel } from "./termin-excel";

function zeile(overrides: Partial<Parameters<typeof terminAlsExcel>[0][number]> = {}) {
  return {
    id: "t1",
    typ: "testspiel" as const,
    start: new Date("2026-05-01T18:30:00"),
    ende: null,
    ort: "Sporthalle",
    beschreibung: "gegen TuS Musterstadt",
    pflichtspiel: null,
    freundschaftsTyp: null,
    mannschaftName: "Herren 1",
    schiedsrichterName: null,
    schiedsrichterEmail: null,
    ordnerName: null,
    kioskdienstName: null,
    kassiererName: null,
    zeitnehmerName: null,
    sekretaerName: null,
    rollenBedarf: undefined,
    ...overrides,
  };
}

describe("terminAlsExcel", () => {
  it("schreibt Kopfzeile und alle Dienst-Rollen-Spalten", async () => {
    const buffer = await terminAlsExcel([
      zeile({ schiedsrichterName: "Max Mustermann", ordnerName: "Lena Fischer, Anna Klein" }),
    ]);

    const workbook = new ExcelJS.Workbook();
    // Buffer.from(arrayBuffer) liefert Buffer<ArrayBufferLike>, exceljs'
    // Typings erwarten den engeren globalen Buffer-Typ — zur Laufzeit identisch
    // (siehe gleicher Cast in funktionstraeger-import.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Uhrzeit",
      "Typ",
      "Ort",
      "Beschreibung",
      "Mannschaft",
      "Schiedsrichter",
      "Schiedsrichter-E-Mail",
      "Ordner",
      "Kioskdienst",
      "Kassierer",
      "Zeitnehmer",
      "Sekretär",
    ]);
    // Zeile 2 ist die Tages-Trennzeile (siehe gruppiereProTag-Nutzung in
    // termin-excel.ts), die eigentlichen Daten stehen ab Zeile 3. Beim
    // erneuten Laden aus dem Buffer sind die beim Schreiben genutzten
    // key-Namen (siehe sheet.columns in termin-excel.ts) nicht mehr verfügbar
    // — exceljs kennt beim Lesen nur noch Spaltenbuchstaben/-nummern. Ohne
    // eigene Datum-Spalte (steht bereits in der Trennzeile) rutscht alles um
    // eine Spalte nach links: Schiedsrichter ist jetzt F statt G, Ordner H
    // statt I.
    expect(sheet.getRow(2).getCell("A").value).toContain("2026");
    expect(sheet.getRow(3).getCell("F").value).toBe("Max Mustermann");
    expect(sheet.getRow(3).getCell("H").value).toBe("Lena Fischer, Anna Klein");
  });

  it("beschränkt die Spalten auf die ausgewählten Rollen", async () => {
    const buffer = await terminAlsExcel(
      [zeile({ schiedsrichterName: "Max Mustermann", ordnerName: "Lena Fischer" })],
      ["schiedsrichter"]
    );
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Uhrzeit",
      "Typ",
      "Ort",
      "Beschreibung",
      "Mannschaft",
      "Schiedsrichter",
      "Schiedsrichter-E-Mail",
    ]);
  });

  it("zeigt \"intern\" statt einer leeren Zelle, wenn die Rolle für diesen Termin keinen Bedarf hat", async () => {
    const buffer = await terminAlsExcel([
      zeile({ ordnerName: null, rollenBedarf: { ordner: false, kioskdienst: true, kassierer: true, zeitnehmer: true, sekretaer: true } }),
    ]);
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;
    expect(sheet.getRow(3).getCell("H").value).toBe("intern");
  });

  it("zeigt \"offen\" statt einer leeren Zelle, wenn die Rolle noch unbesetzt ist", async () => {
    const buffer = await terminAlsExcel([
      zeile({ ordnerName: null, rollenBedarf: { ordner: true, kioskdienst: true, kassierer: true, zeitnehmer: true, sekretaer: true } }),
    ]);
    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;
    expect(sheet.getRow(3).getCell("H").value).toBe("offen");
  });

  it("gruppiert Termine an verschiedenen Tagen mit je eigener Trennzeile", async () => {
    const buffer = await terminAlsExcel([
      zeile({ id: "t1", start: new Date("2026-05-01T18:30:00") }),
      zeile({ id: "t2", start: new Date("2026-05-02T10:00:00") }),
    ]);

    const workbook = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;

    // Kopfzeile(1) + Trennzeile Tag1(2) + Datenzeile(3) + Trennzeile Tag2(4)
    // + Datenzeile(5).
    expect(sheet.rowCount).toBe(5);
    expect(sheet.getRow(2).getCell("A").value).not.toBe(
      sheet.getRow(4).getCell("A").value
    );
  });

  it("erzeugt eine leere Tabelle (nur Kopfzeile) ohne Termine", async () => {
    const buffer = await terminAlsExcel([]);
    const workbook = new ExcelJS.Workbook();
    // Buffer.from(arrayBuffer) liefert Buffer<ArrayBufferLike>, exceljs'
    // Typings erwarten den engeren globalen Buffer-Typ — zur Laufzeit identisch
    // (siehe gleicher Cast in funktionstraeger-import.ts).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;
    expect(sheet.rowCount).toBe(1);
  });
});
