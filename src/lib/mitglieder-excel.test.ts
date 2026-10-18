import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { leseMitgliederExcel, mitgliederAlsExcel, mitgliederVorlage } from "./mitglieder-excel";
import { planeImport, type ExportZeile } from "./mitglieder-import";

const zeile = (z: Partial<ExportZeile>): ExportZeile => ({
  vorname: "Max", name: "Mustermann", geburtsdatum: "05.03.1990", geschlecht: "Männlich", email: "max@x.de", telefon: "", status: "Aktiv",
  art: "Fördermitglied", eintritt: "01.07.2020", austritt: "", bemerkung: "", mannschaften: "Männer (Spieler/in)", ...z,
});

async function arbeitsblatt(kopf: string[], zeilen: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("x");
  sheet.addRow(kopf);
  zeilen.forEach((z) => sheet.addRow(z));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("Excel-Rundlauf", () => {
  it("ein Export lässt sich wieder importieren (Mannschaften-Spalte wird ignoriert)", async () => {
    const buffer = await mitgliederAlsExcel([zeile({}), zeile({ vorname: "Anna", name: "Meier", email: "anna@x.de", geburtsdatum: "", geschlecht: "Weiblich", status: "Passiv", art: "", eintritt: "", mannschaften: "" })]);
    const gelesen = await leseMitgliederExcel(buffer);
    expect(gelesen.fehler).toBeNull();
    expect(gelesen.zeilen).toHaveLength(2);
    const plan = planeImport(gelesen.zeilen, { vorhandene: [], arten: [], heute: "2026-10-18" });
    expect(plan.fehler).toEqual([]);
    expect(plan.neu).toHaveLength(2);
    expect(plan.neu[0]).toMatchObject({ artName: "Fördermitglied", wert: { vorname: "Max", geburtsdatum: "1990-03-05", geschlecht: "m", eintrittsdatum: "2020-07-01", status: "aktiv" } });
    expect(plan.neu[1].wert).toMatchObject({ vorname: "Anna", geschlecht: "w", status: "passiv", geburtsdatum: null });
    expect(plan.neueArten).toEqual(["Fördermitglied"]);
  });

  it("entschärft Formeln im Export", async () => {
    const gelesen = await leseMitgliederExcel(await mitgliederAlsExcel([zeile({ bemerkung: "=HYPERLINK(\"http://böse\")" })]));
    expect(gelesen.zeilen[0].felder.bemerkung).toBe("'=HYPERLINK(\"http://böse\")");
  });

  it("die Vorlage ist lesbar", async () => {
    const gelesen = await leseMitgliederExcel(await mitgliederVorlage());
    expect(gelesen.fehler).toBeNull();
    expect(gelesen.zeilen).toHaveLength(1);
  });
});

describe("leseMitgliederExcel", () => {
  it("verlangt Vorname und Nachname in der Kopfzeile", async () => {
    const r = await leseMitgliederExcel(await arbeitsblatt(["Name", "E-Mail"], [["Muster", "m@x.de"]]));
    expect(r.fehler).toContain("Vorname");
    expect(r.zeilen).toEqual([]);
  });
  it("Spaltenreihenfolge und Aliase egal, Excel-Datum und leere Zeilen", async () => {
    const r = await leseMitgliederExcel(await arbeitsblatt(["Nachname", "Vorname", "Geboren", "Mail"], [["Roth", "Tim", new Date("2001-02-03T00:00:00Z"), "t@x.de"], [], ["", "", "", ""]]));
    expect(r.fehler).toBeNull();
    expect(r.zeilen).toHaveLength(1);
    const plan = planeImport(r.zeilen, { vorhandene: [], arten: [], heute: "2026-10-18" });
    expect(plan.neu[0].wert).toMatchObject({ vorname: "Tim", name: "Roth", geburtsdatum: "2001-02-03", email: "t@x.de" });
  });
});
