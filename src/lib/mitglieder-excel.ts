import "server-only";
import ExcelJS from "exceljs";
import { FELDER, KOPF_TITEL, feldFuerKopf, zelleSicher, type ExportZeile, type FeldName, type RohZeile } from "@/lib/mitglieder-import";

const BREITEN: Record<FeldName | "mannschaften", number> = {
  vorname: 16,
  name: 18,
  geburtsdatum: 14,
  geschlecht: 12,
  email: 28,
  telefon: 18,
  status: 12,
  art: 22,
  eintritt: 12,
  austritt: 12,
  bemerkung: 30,
  mannschaften: 36,
};

async function alsBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function kopf(sheet: ExcelJS.Worksheet, mitMannschaften: boolean) {
  const spalten = [...FELDER.map((f) => ({ header: KOPF_TITEL[f], key: f, width: BREITEN[f] })), ...(mitMannschaften ? [{ header: "Mannschaften", key: "mannschaften", width: BREITEN.mannschaften }] : [])];
  sheet.columns = spalten;
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

/** Export der (gefilterten) Mitglieder. Die Spalten entsprechen der Vorlage, "Mannschaften" (laufende Saison) kommt nur beim Export dazu und wird beim Import ignoriert. */
export async function mitgliederAlsExcel(zeilen: ExportZeile[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mitglieder");
  kopf(sheet, true);
  for (const z of zeilen) {
    sheet.addRow(Object.fromEntries(Object.entries(z).map(([k, v]) => [k, zelleSicher(String(v ?? ""))])));
  }
  return alsBuffer(workbook);
}

/** Leere Vorlage mit Beispielzeile und einem Hinweisblatt. */
export async function mitgliederVorlage(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Mitglieder");
  kopf(sheet, false);
  sheet.addRow({
    vorname: "Max",
    name: "Mustermann",
    geburtsdatum: "05.03.1990",
    geschlecht: "männlich",
    email: "max@beispiel.de",
    telefon: "0151 1234567",
    status: "Aktiv",
    art: "Fördermitglied",
    eintritt: "01.07.2020",
    austritt: "",
    bemerkung: "Beispielzeile bitte löschen",
  });
  const hinweise = workbook.addWorksheet("Hinweise");
  hinweise.columns = [{ width: 100 }];
  [
    "Pflicht sind nur Vorname und Nachname. Alle anderen Spalten sind freiwillig; Spalten dürfen in beliebiger Reihenfolge stehen.",
    "Datum als TT.MM.JJJJ (z.B. 05.03.1990). Geschlecht: männlich, weiblich oder divers. Status: Aktiv, Passiv oder Ausgetreten (leer = Aktiv).",
    "Art der Mitgliedschaft: Gibt es die Art noch nicht, wird sie beim Import neu angelegt.",
    "Wer es schon gibt (gleiche E-Mail-Adresse oder gleicher Name), wird übersprungen und nicht doppelt angelegt.",
    "Mannschaften werden nicht importiert; ordnet sie danach in der Mitgliederliste zu.",
  ].forEach((t) => hinweise.addRow([t]));
  return alsBuffer(workbook);
}

function zellWert(wert: unknown): unknown {
  if (wert == null) return "";
  if (wert instanceof Date) return wert;
  if (typeof wert === "object") {
    const o = wert as Record<string, unknown>;
    if ("text" in o) return String(o.text ?? "").trim();
    if ("richText" in o) return (o.richText as { text: string }[]).map((r) => r.text).join("").trim();
    if ("result" in o) return zellWert(o.result);
  }
  return String(wert).trim();
}

/** Liest das erste Arbeitsblatt. Kopfzeile: mindestens Vorname und Nachname. Leere Zeilen werden übersprungen. */
export async function leseMitgliederExcel(buffer: Buffer): Promise<{ zeilen: RohZeile[]; fehler: string | null }> {
  const workbook = new ExcelJS.Workbook();
  // Buffer.from(arrayBuffer) liefert Buffer<ArrayBufferLike>, exceljs' Typings erwarten den engeren Buffer-Typ — zur Laufzeit identisch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { zeilen: [], fehler: "Kein Arbeitsblatt gefunden." };

  const spalten = new Map<number, FeldName>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, nr) => {
    const feld = feldFuerKopf(String(zellWert(cell.value) ?? ""));
    if (feld && ![...spalten.values()].includes(feld)) spalten.set(nr, feld);
  });
  const felder = new Set(spalten.values());
  if (!felder.has("vorname") || !felder.has("name")) {
    return { zeilen: [], fehler: "Die erste Zeile muss mindestens die Spalten Vorname und Nachname enthalten (am besten die Vorlage verwenden)." };
  }

  const zeilen: RohZeile[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, nr) => {
    if (nr === 1) return;
    const werte: RohZeile["felder"] = {};
    let belegt = false;
    row.eachCell({ includeEmpty: false }, (cell, spalte) => {
      const feld = spalten.get(spalte);
      if (!feld) return;
      const w = zellWert(cell.value);
      if (w !== "") belegt = true;
      werte[feld] = w;
    });
    if (belegt) zeilen.push({ zeilenNr: nr, felder: werte });
  });
  return { zeilen, fehler: null };
}
