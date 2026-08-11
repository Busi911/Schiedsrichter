import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseFunktionstraegerExcel } from "./funktionstraeger-import";

async function buildWorkbook(
  header: string[],
  zeilen: (string | undefined)[][]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Funktionsträger");
  sheet.addRow(header);
  for (const zeile of zeilen) sheet.addRow(zeile);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parseFunktionstraegerExcel", () => {
  it("parst gültige Zeilen korrekt", async () => {
    const buffer = await buildWorkbook(
      ["Name", "E-Mail", "Rolle", "Mannschaft"],
      [
        ["Dennis Weber", "Dennis@Example.org", "Schiedsrichter", undefined],
        ["Anna Muster", "anna@example.org", "Trainer", "Damen 1"],
      ]
    );

    const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);

    expect(fehler).toHaveLength(0);
    expect(zeilen).toHaveLength(2);
    // E-Mail wird kleingeschrieben normalisiert.
    expect(zeilen[0]).toMatchObject({
      name: "Dennis Weber",
      email: "dennis@example.org",
      typ: "schiedsrichter",
      mannschaftName: null,
    });
    expect(zeilen[1]).toMatchObject({
      name: "Anna Muster",
      email: "anna@example.org",
      typ: "trainer",
      mannschaftName: "Damen 1",
    });
  });

  it("akzeptiert Spaltenalias-Schreibweisen und Groß-/Kleinschreibung", async () => {
    const buffer = await buildWorkbook(
      ["name", "Mail", "Funktion", "Team"],
      [["Max Test", "max@example.org", "Ordner", undefined]]
    );

    const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
    expect(fehler).toHaveLength(0);
    expect(zeilen[0].typ).toBe("ordner");
  });

  it("meldet einen Fehler bei fehlender E-Mail", async () => {
    const buffer = await buildWorkbook(
      ["Name", "E-Mail", "Rolle"],
      [["Ohne Mail", "", "Schiedsrichter"]]
    );

    const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
    expect(zeilen).toHaveLength(0);
    expect(fehler).toHaveLength(1);
    expect(fehler[0].grund).toMatch(/E-Mail/);
  });

  it("meldet einen Fehler bei unbekannter Rolle", async () => {
    const buffer = await buildWorkbook(
      ["Name", "E-Mail", "Rolle"],
      [["Jemand", "jemand@example.org", "Vorstand"]]
    );

    const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
    expect(zeilen).toHaveLength(0);
    expect(fehler).toHaveLength(1);
    expect(fehler[0].grund).toMatch(/Unbekannte Rolle/);
  });

  it("überspringt komplett leere Zeilen", async () => {
    const buffer = await buildWorkbook(
      ["Name", "E-Mail", "Rolle"],
      [
        ["Erste Person", "erste@example.org", "Zeitnehmer"],
        [undefined, undefined, undefined],
        ["Zweite Person", "zweite@example.org", "Sekretär"],
      ]
    );

    const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
    expect(fehler).toHaveLength(0);
    expect(zeilen).toHaveLength(2);
  });

  it("meldet einen Fehler, wenn Pflichtspalten in der Kopfzeile fehlen", async () => {
    const buffer = await buildWorkbook(
      ["Name", "Telefon"],
      [["Jemand", "0123"]]
    );

    const { zeilen, fehler } = await parseFunktionstraegerExcel(buffer);
    expect(zeilen).toHaveLength(0);
    expect(fehler).toHaveLength(1);
  });
});
