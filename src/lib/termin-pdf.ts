import "server-only";
import PDFDocument from "pdfkit";
import type { holeTermineFuerAuswertung } from "./termin-auswertung";
import {
  standardRollen,
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
  auswaertsspiel: "Auswärtsspiel",
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
  eigeneDienste: 110,
};

// "offen" statt einer leeren Zelle, wenn tatsächlich noch jemand fehlt
// (rollenBedarf === true, kein Name) — eine leere Zelle war sonst optisch
// nicht von "kein Bedarf" (siehe "intern" unten) zu unterscheiden und fiel
// beim schnellen Überfliegen des PDFs nicht als Lücke auf.
const ROLLEN_WERT: Record<AuswertungsRolle, (z: Zeile) => string> = {
  schiedsrichter: (z) => z.schiedsrichterName ?? "",
  ordner: (z) => rollenZellenWert(z.ordnerName, z.rollenBedarf?.ordner, "offen"),
  kioskdienst: (z) =>
    rollenZellenWert(z.kioskdienstName, z.rollenBedarf?.kioskdienst, "offen"),
  kassierer: (z) =>
    rollenZellenWert(z.kassiererName, z.rollenBedarf?.kassierer, "offen"),
  zeitnehmer: (z) =>
    rollenZellenWert(z.zeitnehmerName, z.rollenBedarf?.zeitnehmer, "offen"),
  sekretaer: (z) =>
    rollenZellenWert(z.sekretaerName, z.rollenBedarf?.sekretaer, "offen"),
  eigeneDienste: (z) => z.eigeneDiensteText ?? "",
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
  const ausgewaehlteRollen = rollen?.length ? rollen : standardRollen(zeilen);

  const basisSpalten = [
    { label: "Zeit", width: 35 },
    { label: "Typ", width: 90 },
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
    // Zellen brechen um statt mit "…" abgeschnitten zu werden (lange Namen, "Freundschaftsspiel"): die Zeile
    // wird so hoch wie ihre höchste Zelle. Höchstens MAX_ZEILEN Zeilen je Zelle, danach wird gekürzt.
    const MAX_ZEILEN = 4;
    const ZELLEN_RAND = 4;
    let y = doc.page.margins.top;

    // Die Spaltenbreiten oben sind Richtwerte: bleibt Platz übrig (Rollen-Auswahl, siehe admin/auswertung/page.tsx),
    // wird proportional auf die volle Seitenbreite hochskaliert; sind alle Rollen gewählt und die Summe breiter als
    // die Seite, wird auf die Seitenbreite VERKLEINERT (vorher ragte die Tabelle über den Rand). Die Zellen brechen um.
    const basisBreite = basisSpalten.reduce((summe, s) => summe + s.width, 0);
    const skalierung = inhaltsBreite / basisBreite;
    const schriftgroesse = skalierung < 0.9 ? 8 : 9;
    const SPALTEN = basisSpalten.map((s) => ({
      ...s,
      width: s.width * skalierung,
    }));

    function zeilenHoehe(werte: string[], fett: boolean): number {
      doc.font(fett ? "Helvetica-Bold" : "Helvetica").fontSize(schriftgroesse);
      const hoehen = werte.map((wert, i) =>
        wert ? doc.heightOfString(wert, { width: SPALTEN[i].width - ZELLEN_RAND }) : 0
      );
      return Math.min(Math.max(rowHeight, Math.max(...hoehen) + 6), doc.currentLineHeight() * MAX_ZEILEN + 6);
    }

    function zeichneZeile(werte: string[], fett: boolean, hoehe: number) {
      let x = startX;
      doc.font(fett ? "Helvetica-Bold" : "Helvetica").fontSize(schriftgroesse);
      werte.forEach((wert, i) => {
        // height begrenzt auf MAX_ZEILEN Zeilen: erst darüber wird mit "…" gekürzt, nie in die nächste Zeile hinein geschrieben.
        doc.text(wert, x, y, {
          width: SPALTEN[i].width - ZELLEN_RAND,
          height: hoehe - 2,
          ellipsis: true,
        });
        x += SPALTEN[i].width;
      });
      y += hoehe;
    }

    function kopfzeile() {
      const kopf = SPALTEN.map((s) => s.label);
      zeichneZeile(kopf, true, zeilenHoehe(kopf, true));
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
        const werte = [
          formatZeitKurz(z.start),
          TYP_LABEL[z.typ] ?? z.typ,
          z.ort ?? "",
          z.mannschaftName ?? "",
          ...ausgewaehlteRollen.map((r) => ROLLEN_WERT[r](z)),
        ];
        const hoehe = zeilenHoehe(werte, false);
        if (y + hoehe > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          kopfzeile();
        }
        zeichneZeile(werte, false, hoehe);
      }
    }

    if (zeilen.length === 0) {
      doc.font("Helvetica").fontSize(9).text("Keine Termine für die gewählten Filter.", startX, y);
    }

    doc.end();
  });
}
