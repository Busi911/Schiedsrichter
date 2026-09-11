import "server-only";
import PDFDocument from "pdfkit";
import type { holeTermineFuerAuswertung } from "./termin-auswertung";
import { formatDatumKurz, formatWochentagDatum, formatZeitKurz } from "./format";
import { gruppiereProTag } from "./kalender";

type Zeile = Awaited<ReturnType<typeof holeTermineFuerAuswertung>>[number];

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Beschreibung/Schiedsrichter-E-Mail bewusst weggelassen (anders als in der
// Excel-Version, siehe termin-excel.ts) — bei sechs möglichen Dienst-Rollen
// pro Termin reicht die Breite der A4-Querformat-Seite sonst nicht mehr für
// eine lesbare Tabelle.
const SPALTEN = [
  { label: "Datum", width: 55 },
  { label: "Zeit", width: 35 },
  { label: "Typ", width: 70 },
  { label: "Ort", width: 85 },
  { label: "Mannschaft", width: 90 },
  { label: "Schiedsrichter", width: 120 },
  { label: "Ordner", width: 60 },
  { label: "Kioskdienst", width: 60 },
  { label: "Kassierer", width: 55 },
  { label: "Zeitnehmer", width: 60 },
  { label: "Sekretär", width: 60 },
];

export function terminAlsPdf(zeilen: Zeile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      layout: "landscape",
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const startX = doc.page.margins.left;
    const rowHeight = 18;
    let y = doc.page.margins.top;

    function zeichneZeile(werte: string[], fett: boolean) {
      let x = startX;
      doc.font(fett ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      werte.forEach((wert, i) => {
        // height muss mitgegeben werden, sonst wirkt ellipsis nicht (pdfkit
        // kürzt nur, wenn der Text die angegebene Höhe überschreiten würde) —
        // ohne height lief ein zu langer Wert (z.B. "Frei. (laut nuLiga,
        // noch nicht zugeordnet)" in der Schiedsrichter-Spalte) stattdessen
        // mehrzeilig um und überlappte die nächste Zeile.
        doc.text(wert, x, y, {
          width: SPALTEN[i].width,
          height: rowHeight,
          ellipsis: true,
        });
        x += SPALTEN[i].width;
      });
      y += rowHeight;
    }

    function kopfzeile() {
      zeichneZeile(
        SPALTEN.map((s) => s.label),
        true
      );
    }

    doc.font("Helvetica-Bold").fontSize(16).text("Dienstplan", startX, y);
    y += 28;
    kopfzeile();

    // Nach Kalendertag gruppiert (zeilen kommen bereits nach Startzeit
    // sortiert aus holeTermineFuerAuswertung) — eine fette Tages-Trennzeile
    // macht lange Listen scanbar, ohne die Datum-Spalte pro Zeile zu
    // entfernen (die bleibt für sich genommen weiterhin eindeutig lesbar).
    for (const { items } of gruppiereProTag(zeilen)) {
      // Trennzeile zusammen mit der Kopfzeile auf die nächste Seite, statt
      // sie als letzte Zeile allein am Seitenende hängen zu lassen.
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight * 2) {
        doc.addPage();
        y = doc.page.margins.top;
        kopfzeile();
      }
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(formatWochentagDatum(items[0].start), startX, y);
      y += rowHeight;

      for (const z of items) {
        if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
          doc.addPage();
          y = doc.page.margins.top;
          kopfzeile();
        }
        zeichneZeile(
          [
            formatDatumKurz(z.start),
            formatZeitKurz(z.start),
            TYP_LABEL[z.typ] ?? z.typ,
            z.ort ?? "",
            z.mannschaftName ?? "",
            z.schiedsrichterName ?? "",
            z.ordnerName ?? "",
            z.kioskdienstName ?? "",
            z.kassiererName ?? "",
            z.zeitnehmerName ?? "",
            z.sekretaerName ?? "",
          ],
          false
        );
      }
    }

    if (zeilen.length === 0) {
      doc.font("Helvetica").fontSize(9).text("Keine Termine für die gewählten Filter.", startX, y);
    }

    doc.end();
  });
}
