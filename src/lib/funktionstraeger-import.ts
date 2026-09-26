import "server-only";
import ExcelJS from "exceljs";

export const FUNKTIONSTRAEGER_TYPEN = [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
  "trainer",
  "ordner",
  "kioskdienst",
  "kassierer",
] as const;

const ROLLE_ALIASE: Record<string, (typeof FUNKTIONSTRAEGER_TYPEN)[number]> = {
  schiedsrichter: "schiedsrichter",
  zeitnehmer: "zeitnehmer",
  sekretär: "sekretaer",
  sekretaer: "sekretaer",
  trainer: "trainer",
  ordner: "ordner",
  kioskdienst: "kioskdienst",
  kassierer: "kassierer",
};

export type ImportZeile = {
  zeilenNr: number;
  name: string;
  email: string;
  typ: (typeof FUNKTIONSTRAEGER_TYPEN)[number];
  mannschaftName: string | null;
  // Nur gesetzt, wenn die optionale Spalte "Lizenz gültig bis" vorhanden UND
  // als Datum lesbar war — welche Rollen ein Lizenz-Ablaufdatum überhaupt
  // fachlich kennen (siehe LIZENZ_ROLLEN in lib/lizenz-rollen.ts), prüft
  // erst die Anwendungsstelle (funktionstraegerImportieren in
  // admin/actions.ts), nicht das Parsen hier.
  lizenzGueltigBis: Date | null;
};

export type ImportFehler = { zeilenNr: number; grund: string };

function normalisiereHeader(wert: unknown): string {
  return String(wert ?? "")
    .trim()
    .toLowerCase();
}

function zellText(wert: unknown): string {
  if (wert == null) return "";
  if (wert instanceof Date) return wert.toISOString();
  if (typeof wert === "object" && "text" in (wert as Record<string, unknown>)) {
    return String((wert as { text: unknown }).text ?? "").trim();
  }
  if (typeof wert === "object" && "richText" in (wert as Record<string, unknown>)) {
    const rich = (wert as { richText: { text: string }[] }).richText;
    return rich.map((r) => r.text).join("").trim();
  }
  return String(wert).trim();
}

// Excel liefert ein datumsformatiertes Feld als natives Date-Objekt (siehe
// zellText oben), Freitext-Eingabe dagegen meist als deutsches
// "TT.MM.JJJJ" oder ISO "JJJJ-MM-TT" — beide werden unterstützt, alles
// andere ergibt null (kein Ablaufdatum, kein Import-Fehler: die Spalte ist
// optional und ein unlesbares Datum soll die Person trotzdem anlegen, nur
// eben ohne Lizenz-Ablauf, der sich jederzeit manuell nachtragen lässt).
function parseLizenzDatum(wert: unknown): Date | null {
  if (wert instanceof Date && !Number.isNaN(wert.getTime())) return wert;
  const text = zellText(wert);
  if (!text) return null;

  const deutsch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (deutsch) {
    const [, tag, monat, jahr] = deutsch;
    return new Date(Number(jahr), Number(monat) - 1, Number(tag));
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) {
    const [, jahr, monat, tag] = iso;
    return new Date(Number(jahr), Number(monat) - 1, Number(tag));
  }
  return null;
}

/**
 * Erwartet eine Kopfzeile mit den Spalten Name, E-Mail, Rolle, Mannschaft
 * (Reihenfolge egal, Groß-/Kleinschreibung egal). "Mannschaft" ist optional
 * und nur für die Rolle "trainer" relevant. "Lizenz gültig bis" ist
 * optional und nur für schiedsrichter/zeitnehmer/sekretaer relevant (siehe
 * LIZENZ_ROLLEN in lib/lizenz-rollen.ts) — praktisch für die Erstanlage
 * vieler Funktionsträger auf einmal, statt das Ablaufdatum hinterher für
 * jede Person einzeln im Bearbeiten-Dialog nachzutragen.
 */
export async function parseFunktionstraegerExcel(
  buffer: Buffer
): Promise<{ zeilen: ImportZeile[]; fehler: ImportFehler[] }> {
  const workbook = new ExcelJS.Workbook();
  // Buffer.from(arrayBuffer) liefert Buffer<ArrayBufferLike>, exceljs'
  // Typings erwarten den engeren globalen Buffer-Typ — zur Laufzeit identisch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { zeilen: [], fehler: [{ zeilenNr: 0, grund: "Kein Arbeitsblatt gefunden." }] };
  }

  const headerRow = worksheet.getRow(1);
  const spalten = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalisiereHeader(cell.value);
    if (["name"].includes(header)) spalten.set(colNumber, "name");
    else if (["e-mail", "email", "mail"].includes(header)) spalten.set(colNumber, "email");
    else if (["rolle", "funktion", "typ"].includes(header)) spalten.set(colNumber, "typ");
    else if (["mannschaft", "team"].includes(header)) spalten.set(colNumber, "mannschaft");
    else if (
      ["lizenz", "lizenz gültig bis", "lizenz bis", "gültig bis"].includes(header)
    )
      spalten.set(colNumber, "lizenz");
  });

  if (!([...spalten.values()].includes("name") && [...spalten.values()].includes("email") && [...spalten.values()].includes("typ"))) {
    return {
      zeilen: [],
      fehler: [
        {
          zeilenNr: 1,
          grund:
            "Kopfzeile muss mindestens die Spalten Name, E-Mail und Rolle enthalten.",
        },
      ],
    };
  }

  const zeilen: ImportZeile[] = [];
  const fehler: ImportFehler[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const werte: Record<string, string> = {};
    let lizenzRoh: unknown = null;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const feld = spalten.get(colNumber);
      if (!feld) return;
      if (feld === "lizenz") {
        lizenzRoh = cell.value;
        return;
      }
      werte[feld] = zellText(cell.value);
    });

    if (!werte.name && !werte.email) return; // leere Zeile überspringen

    if (!werte.name) {
      fehler.push({ zeilenNr: rowNumber, grund: "Name fehlt." });
      return;
    }
    if (!werte.email || !werte.email.includes("@")) {
      fehler.push({ zeilenNr: rowNumber, grund: "Ungültige oder fehlende E-Mail." });
      return;
    }
    const typ = ROLLE_ALIASE[normalisiereHeader(werte.typ)];
    if (!typ) {
      fehler.push({
        zeilenNr: rowNumber,
        grund: `Unbekannte Rolle "${werte.typ}".`,
      });
      return;
    }

    zeilen.push({
      zeilenNr: rowNumber,
      name: werte.name,
      email: werte.email.toLowerCase(),
      typ,
      mannschaftName: werte.mannschaft || null,
      lizenzGueltigBis: parseLizenzDatum(lizenzRoh),
    });
  });

  return { zeilen, fehler };
}
