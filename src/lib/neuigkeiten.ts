// Neuigkeiten und Berichte eines Vereins (reine Regeln, ohne Datenbank). Der Verein schreibt reinen Text; HTML wird
// nirgends ausgegeben (Seite: Text mit Absätzen, Feed: XML-escaped) — so entsteht kein XSS und kein Fremd-HTML im Feed.

export const NEUIGKEIT_TITEL_MAX = 120;
export const NEUIGKEIT_TEXT_MAX = 5000;
export const FEED_MAX_EINTRAEGE = 20;

export class NeuigkeitFehler extends Error {}

export function pruefeNeuigkeit(eingabe: { titel: string; text: string }): { titel: string; text: string } {
  const titel = eingabe.titel.trim();
  const text = eingabe.text.replace(/\r\n/g, "\n").trim();
  if (!titel) throw new NeuigkeitFehler("Bitte einen Titel eintragen.");
  if (titel.length > NEUIGKEIT_TITEL_MAX) throw new NeuigkeitFehler(`Der Titel darf höchstens ${NEUIGKEIT_TITEL_MAX} Zeichen lang sein.`);
  if (!text) throw new NeuigkeitFehler("Bitte einen Text eintragen.");
  if (text.length > NEUIGKEIT_TEXT_MAX) throw new NeuigkeitFehler(`Der Text darf höchstens ${NEUIGKEIT_TEXT_MAX} Zeichen lang sein.`);
  return { titel, text };
}

/** Absätze für die Anzeige: getrennt durch Leerzeilen. */
export function absaetze(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Kurzfassung für Listen und die Feed-Beschreibung: am Wortende gekürzt, mit „…“. */
export function kurztext(text: string, max = 200): string {
  const flach = text.replace(/\s+/g, " ").trim();
  if (flach.length <= max) return flach;
  const abschnitt = flach.slice(0, max);
  const lueckeBei = abschnitt.lastIndexOf(" ");
  return `${(lueckeBei > max * 0.6 ? abschnitt.slice(0, lueckeBei) : abschnitt).trimEnd()}…`;
}

/** Ist die Neuigkeit sichtbar? Veröffentlicht heißt: Zeitpunkt gesetzt und erreicht (null = Entwurf). */
export function istVeroeffentlicht(veroeffentlichtAm: Date | null, jetzt: Date): boolean {
  return veroeffentlichtAm !== null && veroeffentlichtAm.getTime() <= jetzt.getTime();
}

export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") // in XML 1.0 nicht erlaubt
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type FeedEintrag = { id: string; titel: string; text: string; datum: Date; link: string };

/** RSS 2.0 für die Homepage des Vereins. Nur Titel, Kurztext, Datum und Link; keine Personen, kein HTML. */
export function baueRssFeed(opt: { vereinName: string; seitenUrl: string; feedUrl: string; eintraege: FeedEintrag[] }): string {
  const eintraege = [...opt.eintraege].sort((a, b) => b.datum.getTime() - a.datum.getTime()).slice(0, FEED_MAX_EINTRAEGE);
  const neuester = eintraege[0]?.datum;
  const items = eintraege
    .map(
      (e) =>
        `    <item>\n      <title>${xmlEscape(e.titel)}</title>\n      <link>${xmlEscape(e.link)}</link>\n      <guid isPermaLink="false">${xmlEscape(e.id)}</guid>\n      <pubDate>${e.datum.toUTCString()}</pubDate>\n      <description>${xmlEscape(kurztext(e.text, 400))}</description>\n    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${xmlEscape(`${opt.vereinName} – Neuigkeiten`)}</title>\n    <link>${xmlEscape(opt.seitenUrl)}</link>\n    <description>${xmlEscape(`Neuigkeiten und Berichte des ${opt.vereinName}`)}</description>\n    <language>de-DE</language>\n    <atom:link href="${xmlEscape(opt.feedUrl)}" rel="self" type="application/rss+xml" />${neuester ? `\n    <lastBuildDate>${neuester.toUTCString()}</lastBuildDate>` : ""}\n${items}\n  </channel>\n</rss>\n`;
}
