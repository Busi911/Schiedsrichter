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
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Datum",
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
    // Beim erneuten Laden aus dem Buffer sind die beim Schreiben genutzten
    // key-Namen (siehe sheet.columns in termin-excel.ts) nicht mehr verfügbar
    // — exceljs kennt beim Lesen nur noch Spaltenbuchstaben/-nummern.
    expect(sheet.getRow(2).getCell("G").value).toBe("Max Mustermann");
    expect(sheet.getRow(2).getCell("I").value).toBe("Lena Fischer, Anna Klein");
  });

  it("erzeugt eine leere Tabelle (nur Kopfzeile) ohne Termine", async () => {
    const buffer = await terminAlsExcel([]);
    const workbook = new ExcelJS.Workbook();
    // Buffer.from(arrayBuffer) liefert Buffer<ArrayBufferLike>, exceljs'
    // Typings erwarten den engeren globalen Buffer-Typ — zur Laufzeit identisch
    // (siehe gleicher Cast in funktionstraeger-import.ts).
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Dienstplan")!;
    expect(sheet.rowCount).toBe(1);
  });
});
