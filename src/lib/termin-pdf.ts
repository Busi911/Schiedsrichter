import "server-only";
import PDFDocument from "pdfkit";
import type { holeTermineFuerAuswertung } from "./termin-auswertung";
import {
  AUSWERTUNG_ROLLEN,
  AUSWERTUNG_ROLLE_LABEL,
  rollenZellenWert,
  type AuswertungsRolle,
} from "./termin-auswertung";
import { formatWochentagDatum, formatZeitKurz } from "./format";
import { gruppiereProTag } from "./kalender";

type Zeile = Awaited<ReturnType<typeof holeTermineFuerAuswertung>>[number];

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

// Breite pro Rolle — Schiedsrichter etwas großzügiger, da dort neben Namen
// auch mal ein Gespann ("Name1 / Name2") oder ein nuLiga-Kürzel steht (siehe
// kombiniereSchiedsrichterZuordnungen in termin-auswertung.ts).
const ROLLEN_BREITE: Record<AuswertungsRolle, number> = {
  schiedsrichter: 120,
  ordner: 60,
  kioskdienst: 60,
  kassierer: 55,
  zeitnehmer: 60,
  sekretaer: 60,
};

const ROLLEN_WERT: Record<AuswertungsRolle, (z: Zeile) => string> = {
  schiedsrichter: (z) => z.schiedsrichterName ?? "",
  ordner: (z) => rollenZellenWert(z.ordnerName, z.rollenBedarf?.ordner, ""),
  kioskdienst: (z) =>
    rollenZellenWert(z.kioskdienstName, z.rollenBedarf?.kioskdienst, ""),
  kassierer: (z) => rollenZellenWert(z.kassiererName, z.rollenBedarf?.kassierer, ""),
  zeitnehmer: (z) => rollenZellenWert(z.zeitnehmerName, z.rollenBedarf?.zeitnehmer, ""),
  sekretaer: (z) => rollenZellenWert(z.sekretaerName, z.rollenBedarf?.sekretaer, ""),
};

// Beschreibung/Schiedsrichter-E-Mail bewusst weggelassen (anders als in der
// Excel-Version, siehe termin-excel.ts) — bei sechs möglichen Dienst-Rollen
// pro Termin reicht die Breite der A4-Querformat-Seite sonst nicht mehr für
// eine lesbare Tabelle. Kein eigenes Datum je Zeile — das steht bereits in
// der Tages-Trennzeile (siehe gruppiereProTag-Nutzung unten).
export function terminAlsPdf(
  zeilen: Zeile[],
  rollen?: AuswertungsRolle[],
  vereinName?: string
): Promise<Buffer> {
  // Keine (bzw. keine gültige) Auswahl → wie bisher alle Rollen zeigen.
  const ausgewaehlteRollen = rollen?.length ? rollen : AUSWERTUNG_ROLLEN;

  const SPALTEN = [
    { label: "Zeit", width: 35 },
    { label: "Typ", width: 70 },
    { label: "Ort", width: 85 },
    { label: "Mannschaft", width: 145 },
    ...ausgewaehlteRollen.map((r) => ({
      label: AUSWERTUNG_ROLLE_LABEL[r],
      width: ROLLEN_BREITE[r],
    })),
  ];

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
    const inhaltsBreite =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowHeight = 18;
    let y = doc.page.margins.top;

    function zeichneZeile(werte: string[], fett: boolean) {
      let x = startX;
      doc.font(fett ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      werte.forEach((wert, i) => {
        // height muss mitgegeben werden, sonst wirkt ellipsis nicht (pdfkit
        // kürzt nur, wenn der Text die angegebene Höhe überschreiten würde) —
        // ohne height läuft ein zu langer Wert stattdessen mehrzeilig um und
        // überlappt die nächste Zeile.
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

    if (vereinName) {
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(vereinName, startX, y, { width: inhaltsBreite, align: "center" });
      y += 18;
    }
    doc.font("Helvetica-Bold").fontSize(16).text("Dienstplan", startX, y);
    y += 28;
    kopfzeile();

    // Nach Kalendertag gruppiert (zeilen kommen bereits nach Startzeit
    // sortiert aus holeTermineFuerAuswertung) — eine fette Tages-Trennzeile
    // macht lange Listen scanbar und ersetzt die (sonst pro Zeile
    // wiederholte) Datum-Spalte.
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
            formatZeitKurz(z.start),
            TYP_LABEL[z.typ] ?? z.typ,
            z.ort ?? "",
            z.mannschaftName ?? "",
            ...ausgewaehlteRollen.map((r) => ROLLEN_WERT[r](z)),
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
