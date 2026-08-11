import "server-only";
import PDFDocument from "pdfkit";
import type { holeTermineFuerAuswertung } from "./termin-auswertung";

type Zeile = Awaited<ReturnType<typeof holeTermineFuerAuswertung>>[number];

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
};

const SPALTEN = [
  { label: "Datum", width: 65 },
  { label: "Zeit", width: 40 },
  { label: "Typ", width: 65 },
  { label: "Ort", width: 90 },
  { label: "Beschreibung", width: 130 },
  { label: "Mannschaft", width: 90 },
  { label: "Schiedsrichter", width: 100 },
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
        doc.text(wert, x, y, { width: SPALTEN[i].width, ellipsis: true });
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

    doc.font("Helvetica-Bold").fontSize(16).text("Terminauswertung", startX, y);
    y += 28;
    kopfzeile();

    for (const z of zeilen) {
      if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
        doc.addPage();
        y = doc.page.margins.top;
        kopfzeile();
      }
      zeichneZeile(
        [
          z.start.toLocaleDateString("de-DE"),
          z.start.toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          TYP_LABEL[z.typ] ?? z.typ,
          z.ort ?? "",
          z.beschreibung ?? "",
          z.mannschaftName ?? "",
          z.schiedsrichterName ?? "",
        ],
        false
      );
    }

    if (zeilen.length === 0) {
      doc.font("Helvetica").fontSize(9).text("Keine Termine für die gewählten Filter.", startX, y);
    }

    doc.end();
  });
}
