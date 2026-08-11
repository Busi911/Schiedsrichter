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
