// Zentrale Datums-/Zeit-Formatierung mit fest verdrahteter Zeitzone.
//
// Ohne explizite timeZone verwendet Intl.DateTimeFormat/toLocale* die
// Zeitzone der Laufzeitumgebung — lokal meist zufällig ähnlich zur
// deutschen Zeit, auf Vercel (Serverless, Standard UTC) aber nicht. Das
// hätte Anzeigen um 1-2h verschoben und bei Terminen nahe Mitternacht sogar
// das falsche Datum gezeigt. Handballtermine sind immer in deutscher
// Ortszeit gemeint, unabhängig davon, wo der Code gerade läuft.
const ZEITZONE = "Europe/Berlin";

export function formatDatumZeit(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ZEITZONE,
  }).format(d);
}

export function formatDatum(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeZone: ZEITZONE,
  }).format(d);
}

export function formatZeit(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZEITZONE,
  }).format(d);
}

export function formatMonatJahr(jahr: number, monatNull: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: ZEITZONE,
  }).format(new Date(Date.UTC(jahr, monatNull, 1)));
}

// Kurzform TT.MM.JJJJ bzw. HH:MM für CSV-/PDF-Exporte.
export function formatDatumKurz(d: Date): string {
  return d.toLocaleDateString("de-DE", { timeZone: ZEITZONE });
}

export function formatZeitKurz(d: Date): string {
  return d.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZEITZONE,
  });
}

// Deutschland wechselt zwischen MESZ (+02:00, Ende März bis Ende Oktober)
// und MEZ (+01:00, Rest des Jahres). Noon UTC liegt an jedem Kalendertag
// sicher auf derselben Seite der (jeweils um 01:00 UTC stattfindenden)
// EU-Zeitumstellung, daher als Ankerzeitpunkt zur Offset-Bestimmung
// geeignet — unabhängig von der tatsächlichen Uhrzeit.
export function berlinOffset(datumIso: string): string {
  const anker = new Date(`${datumIso}T12:00:00Z`);
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: ZEITZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(anker);
  const tzTeil = teile.find((t) => t.type === "timeZoneName")?.value ?? "GMT+1";
  const stunden = Number(tzTeil.replace("GMT", "")) || 1;
  return `${stunden >= 0 ? "+" : "-"}${String(Math.abs(stunden)).padStart(2, "0")}:00`;
}

// Wandelt den Wert eines <input type="datetime-local"> (naive lokale Zeit
// ohne Zeitzone, z.B. "2026-08-26T19:45") als Europe/Berlin-Zeit in ein
// Date um. new Date(wert) ohne diese Behandlung interpretiert den String
// als lokale Zeit der LAUFZEITUMGEBUNG — auf Vercel (Serverless, Standard
// UTC) landet eine dort eingetragene 19:45 Uhr sonst als 19:45 UTC, also
// 2h (Sommerzeit) bzw. 1h (Winterzeit) zu spät gespeichert.
export function parseBerlinDatumZeit(wert: string): Date {
  const datumTeil = wert.slice(0, 10);
  const zeitTeil = wert.length > 10 ? wert.slice(11) : "00:00";
  const mitSekunden = zeitTeil.length === 5 ? `${zeitTeil}:00` : zeitTeil;
  return new Date(`${datumTeil}T${mitSekunden}${berlinOffset(datumTeil)}`);
}
