import "server-only";
import ExcelJS from "exceljs";
import type { holeTermineFuerAuswertung } from "./termin-auswertung";
import { formatDatumKurz, formatWochentagDatum, formatZeitKurz } from "./format";
import { rundenspielTypLabel } from "./termin-label";
import { gruppiereProTag } from "./kalender";

type Zeile = Awaited<ReturnType<typeof holeTermineFuerAuswertung>>[number];

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Anders als die PDF-Version (siehe termin-pdf.ts, dort aus Platzgründen
// weggelassen) mit Beschreibung + Schiedsrichter-E-Mail — Excel hat keine
// feste Seitenbreite, daher hier die vollständigen Rohdaten für die
// Weiterverarbeitung außerhalb der App.
export async function terminAlsExcel(zeilen: Zeile[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dienstplan");
  sheet.columns = [
    { header: "Datum", key: "datum", width: 12 },
    { header: "Uhrzeit", key: "uhrzeit", width: 9 },
    { header: "Typ", key: "typ", width: 18 },
    { header: "Ort", key: "ort", width: 22 },
    { header: "Beschreibung", key: "beschreibung", width: 30 },
    { header: "Mannschaft", key: "mannschaft", width: 16 },
    { header: "Schiedsrichter", key: "schiedsrichter", width: 22 },
    { header: "Schiedsrichter-E-Mail", key: "schiedsrichterEmail", width: 26 },
    { header: "Ordner", key: "ordner", width: 20 },
    { header: "Kioskdienst", key: "kioskdienst", width: 20 },
    { header: "Kassierer", key: "kassierer", width: 20 },
    { header: "Zeitnehmer", key: "zeitnehmer", width: 20 },
    { header: "Sekretär", key: "sekretaer", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  const spaltenAnzahl = sheet.columns.length;

  // Nach Kalendertag gruppiert (zeilen kommen bereits nach Startzeit
  // sortiert aus holeTermineFuerAuswertung), analog zur PDF-Version (siehe
  // termin-pdf.ts) — eine über alle Spalten zusammengeführte, fett/grau
  // hinterlegte Trennzeile macht auch hier lange Listen scanbar.
  for (const { items } of gruppiereProTag(zeilen)) {
    const trennzeile = sheet.addRow([formatWochentagDatum(items[0].start)]);
    sheet.mergeCells(trennzeile.number, 1, trennzeile.number, spaltenAnzahl);
    trennzeile.font = { bold: true };
    trennzeile.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEEEEE" },
    };

    for (const z of items) {
      sheet.addRow({
        datum: formatDatumKurz(z.start),
        uhrzeit: formatZeitKurz(z.start),
        typ:
          z.typ === "rundenspiel"
            ? rundenspielTypLabel(z.pflichtspiel, z.freundschaftsTyp)
            : TYP_LABEL[z.typ] ?? z.typ,
        ort: z.ort ?? "",
        beschreibung: z.beschreibung ?? "",
        mannschaft: z.mannschaftName ?? "",
        schiedsrichter: z.schiedsrichterName ?? "",
        schiedsrichterEmail: z.schiedsrichterEmail ?? "",
        ordner: z.ordnerName ?? "",
        kioskdienst: z.kioskdienstName ?? "",
        kassierer: z.kassiererName ?? "",
        zeitnehmer: z.zeitnehmerName ?? "",
        sekretaer: z.sekretaerName ?? "",
      });
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
