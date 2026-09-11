import "server-only";
import ExcelJS from "exceljs";
import type { holeTermineFuerAuswertung } from "./termin-auswertung";
import {
  AUSWERTUNG_ROLLEN,
  rollenZellenWert,
  type AuswertungsRolle,
} from "./termin-auswertung";
import { formatWochentagDatum, formatZeitKurz } from "./format";
import { rundenspielTypLabel } from "./termin-label";
import { gruppiereProTag } from "./kalender";

type Zeile = Awaited<ReturnType<typeof holeTermineFuerAuswertung>>[number];

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Schiedsrichter bekommt zusätzlich eine E-Mail-Spalte (anders als die
// übrigen Rollen, siehe termin-pdf.ts, wo aus Platzgründen ganz darauf
// verzichtet wird) — Excel hat keine feste Seitenbreite, daher hier die
// vollständigen Rohdaten für die Weiterverarbeitung außerhalb der App.
const ROLLEN_SPALTEN: Record<
  AuswertungsRolle,
  { header: string; key: string; width: number }[]
> = {
  schiedsrichter: [
    { header: "Schiedsrichter", key: "schiedsrichter", width: 22 },
    { header: "Schiedsrichter-E-Mail", key: "schiedsrichterEmail", width: 26 },
  ],
  ordner: [{ header: "Ordner", key: "ordner", width: 20 }],
  kioskdienst: [{ header: "Kioskdienst", key: "kioskdienst", width: 20 }],
  kassierer: [{ header: "Kassierer", key: "kassierer", width: 20 }],
  zeitnehmer: [{ header: "Zeitnehmer", key: "zeitnehmer", width: 20 }],
  sekretaer: [{ header: "Sekretär", key: "sekretaer", width: 20 }],
};

function rollenWerte(
  z: Zeile,
  rollen: readonly AuswertungsRolle[]
): Record<string, string> {
  const werte: Record<string, string> = {};
  if (rollen.includes("schiedsrichter")) {
    werte.schiedsrichter = z.schiedsrichterName ?? "";
    werte.schiedsrichterEmail = z.schiedsrichterEmail ?? "";
  }
  if (rollen.includes("ordner")) {
    werte.ordner = rollenZellenWert(z.ordnerName, z.rollenBedarf?.ordner, "");
  }
  if (rollen.includes("kioskdienst")) {
    werte.kioskdienst = rollenZellenWert(z.kioskdienstName, z.rollenBedarf?.kioskdienst, "");
  }
  if (rollen.includes("kassierer")) {
    werte.kassierer = rollenZellenWert(z.kassiererName, z.rollenBedarf?.kassierer, "");
  }
  if (rollen.includes("zeitnehmer")) {
    werte.zeitnehmer = rollenZellenWert(z.zeitnehmerName, z.rollenBedarf?.zeitnehmer, "");
  }
  if (rollen.includes("sekretaer")) {
    werte.sekretaer = rollenZellenWert(z.sekretaerName, z.rollenBedarf?.sekretaer, "");
  }
  return werte;
}

// Kein eigenes Datum je Zeile — das steht bereits in der Tages-Trennzeile
// weiter unten (gruppiereProTag), eine Wiederholung pro Zeile wäre nur Rauschen.
export async function terminAlsExcel(
  zeilen: Zeile[],
  rollen?: AuswertungsRolle[]
): Promise<Buffer> {
  // Keine (bzw. keine gültige) Auswahl → wie bisher alle Rollen zeigen.
  const ausgewaehlteRollen = rollen?.length ? rollen : AUSWERTUNG_ROLLEN;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dienstplan");
  sheet.columns = [
    { header: "Uhrzeit", key: "uhrzeit", width: 9 },
    { header: "Typ", key: "typ", width: 18 },
    { header: "Ort", key: "ort", width: 22 },
    { header: "Beschreibung", key: "beschreibung", width: 30 },
    { header: "Mannschaft", key: "mannschaft", width: 16 },
    ...ausgewaehlteRollen.flatMap((r) => ROLLEN_SPALTEN[r]),
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
        uhrzeit: formatZeitKurz(z.start),
        typ:
          z.typ === "rundenspiel"
            ? rundenspielTypLabel(z.pflichtspiel, z.freundschaftsTyp)
            : TYP_LABEL[z.typ] ?? z.typ,
        ort: z.ort ?? "",
        beschreibung: z.beschreibung ?? "",
        mannschaft: z.mannschaftName ?? "",
        ...rollenWerte(z, ausgewaehlteRollen),
      });
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
