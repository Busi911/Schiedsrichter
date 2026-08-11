import "server-only";
import ExcelJS from "exceljs";

export const FUNKTIONSTRAEGER_TYPEN = [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
  "trainer",
  "ordner",
  "kioskdienst",
] as const;

const ROLLE_ALIASE: Record<string, (typeof FUNKTIONSTRAEGER_TYPEN)[number]> = {
  schiedsrichter: "schiedsrichter",
  zeitnehmer: "zeitnehmer",
  sekretär: "sekretaer",
  sekretaer: "sekretaer",
  trainer: "trainer",
  ordner: "ordner",
  kioskdienst: "kioskdienst",
};

export type ImportZeile = {
  zeilenNr: number;
  name: string;
  email: string;
  typ: (typeof FUNKTIONSTRAEGER_TYPEN)[number];
  mannschaftName: string | null;
};

export type ImportFehler = { zeilenNr: number; grund: string };

function normalisiereHeader(wert: unknown): string {
  return String(wert ?? "")
    .trim()
    .toLowerCase();
}

function zellText(wert: unknown): string {
  if (wert == null) return "";
  if (typeof wert === "object" && "text" in (wert as Record<string, unknown>)) {
    return String((wert as { text: unknown }).text ?? "").trim();
  }
  if (typeof wert === "object" && "richText" in (wert as Record<string, unknown>)) {
    const rich = (wert as { richText: { text: string }[] }).richText;
    return rich.map((r) => r.text).join("").trim();
  }
  return String(wert).trim();
}

/**
 * Erwartet eine Kopfzeile mit den Spalten Name, E-Mail, Rolle, Mannschaft
 * (Reihenfolge egal, Groß-/Kleinschreibung egal). "Mannschaft" ist optional
 * und nur für die Rolle "trainer" relevant.
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
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const feld = spalten.get(colNumber);
      if (feld) werte[feld] = zellText(cell.value);
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
    });
  });

  return { zeilen, fehler };
}
