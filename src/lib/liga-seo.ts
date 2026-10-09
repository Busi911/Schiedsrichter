// Strukturierte Daten (schema.org, JSON-LD) der öffentlichen Vereinsseiten: Verein, Mannschaft und anstehende Spiele. So können Suchmaschinen
// und KI-Assistenten Fragen wie "Wann spielt die mC der HSG Dutenhofen?" aus den Seiten beantworten. Nur öffentliche Sport-Daten (keine Personen).
// Reine Funktionen ohne Datenbank/Seiteneffekte, getestet in liga-seo.test.ts.

type SpielDaten = {
  id: string;
  datum: string; // YYYY-MM-DD
  uhrzeit: string | null; // HH:MM
  heimName: string;
  gastName: string;
  halleName: string | null;
  status: string;
};

// Offset von Europe/Berlin an einem Tag (+01:00 Winter, +02:00 Sommer), damit "17:00" als echter Zeitpunkt (ISO 8601) ausgewiesen wird.
function berlinOffset(datum: string): string {
  const mittag = new Date(`${datum}T12:00:00Z`);
  const teil = new Intl.DateTimeFormat("en", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(mittag)
    .find((p) => p.type === "timeZoneName")?.value; // z.B. "GMT+2"
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(teil ?? "");
  if (!m) return "+01:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
}

export function berlinIso(datum: string, uhrzeit: string | null): string {
  if (!uhrzeit || !/^\d{1,2}:\d{2}$/.test(uhrzeit)) return datum; // nur das Datum, wenn die Uhrzeit (noch) fehlt
  return `${datum}T${uhrzeit.padStart(5, "0")}:00${berlinOffset(datum)}`;
}

const STATUS_SCHEMA: Record<string, string> = {
  abgesagt: "https://schema.org/EventCancelled",
  verlegt: "https://schema.org/EventRescheduled",
};

export function spielAlsEvent(s: SpielDaten, url: string, vereinsName: string) {
  return {
    "@type": "SportsEvent",
    name: `${s.heimName} – ${s.gastName}`,
    sport: "Handball",
    startDate: berlinIso(s.datum, s.uhrzeit),
    eventStatus: STATUS_SCHEMA[s.status] ?? "https://schema.org/EventScheduled",
    url,
    homeTeam: { "@type": "SportsTeam", name: s.heimName },
    awayTeam: { "@type": "SportsTeam", name: s.gastName },
    // Ort nur, wenn die Halle bekannt ist (Pflichtangabe für Veranstaltungs-Rich-Results, sonst weglassen statt zu raten).
    ...(s.halleName ? { location: { "@type": "Place", name: s.halleName } } : {}),
    organizer: { "@type": "SportsOrganization", name: vereinsName },
  };
}

export function vereinJsonLd(v: { name: string; url: string; logoUrl: string | null; mannschaften: { name: string; url: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: v.name,
    sport: "Handball",
    url: v.url,
    ...(v.logoUrl ? { logo: v.logoUrl } : {}),
    ...(v.mannschaften.length > 0
      ? { subOrganization: v.mannschaften.map((m) => ({ "@type": "SportsTeam", name: m.name, sport: "Handball", url: m.url })) }
      : {}),
  };
}

export function mannschaftJsonLd(m: {
  vereinsName: string;
  vereinsUrl: string;
  name: string;
  liga: string | null;
  url: string;
  anstehend: (SpielDaten & { url: string })[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: `${m.vereinsName} ${m.name}`,
    sport: "Handball",
    url: m.url,
    ...(m.liga ? { description: `${m.name} des ${m.vereinsName} in der ${m.liga}` } : {}),
    memberOf: { "@type": "SportsOrganization", name: m.vereinsName, url: m.vereinsUrl },
    // Höchstens die nächsten 10 Spiele: aktuell und kompakt, statt einer ganzen Saison.
    event: m.anstehend.slice(0, 10).map((s) => spielAlsEvent(s, s.url, m.vereinsName)),
  };
}

// Als <script type="application/ld+json">-Inhalt: "<" maskieren, damit nie ein </script> im Namen die Seite aufbrechen kann.
export const jsonLdText = (daten: unknown) => JSON.stringify(daten).replace(/</g, "\\u003c");
