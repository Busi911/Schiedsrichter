import "server-only";

// Automatischer Ersatz für den bisherigen manuellen nuLiga-Export-Workflow
// (n8n: Formular mit bis zu drei Hallen-IDs -> HTML-Scrape pro Halle+Monat
// -> JSON). Baut exakt dasselbe JSON-Format wie der bisherige Export, damit
// parseRundenspielJson (src/lib/rundenspiel-import.ts, samt Tests) unverändert
// weiterverwendet werden kann.
//
// Domain/Verband sind bewusst fest verdrahtet auf den einen bereits
// getesteten Anbieter (siehe README: "nuLiga, u.a. beim Hessischen
// Handballverband") — andere Landesverbände nutzen andere nuLiga-Domains
// und müssten hier als weitere Konstante ergänzt werden, sobald das
// gebraucht wird.
const NULIGA_DOMAIN = "hhv-handball.liga.nu";
const NULIGA_FEDERATION = "HHV";

const MONAT_NAMEN = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export type MonatsUrl = {
  locationId: string;
  requestedMonth: string;
  url: string;
};

// Rollierendes Fenster statt fester Start-/Endmonat-Eingabe: läuft die
// Synchronisierung automatisch per Cron, würde ein einmalig eingegebener
// Zeitraum mit der Zeit veralten und müsste jede Saison manuell nachgepflegt
// werden — das ist genau die Reibung, die der automatische Import beseitigen
// soll.
export function baueMonatsUrls(
  hallenIds: string[],
  anzahlMonateVorwaerts = 10,
  jetzt = new Date()
): MonatsUrl[] {
  const urls: MonatsUrl[] = [];

  for (const locationId of hallenIds) {
    let jahr = jetzt.getFullYear();
    let monat = jetzt.getMonth() + 1; // 1-12

    for (let i = 0; i < anzahlMonateVorwaerts; i++) {
      const monatName = MONAT_NAMEN[monat - 1];
      const monatParam = encodeURIComponent(`${monatName} ${jahr}`).replace(
        /%20/g,
        "+"
      );
      urls.push({
        locationId,
        requestedMonth: `${jahr}-${String(monat).padStart(2, "0")}`,
        url:
          `https://${NULIGA_DOMAIN}/cgi-bin/WebObjects/nuLigaHBDE.woa/wa/courtInfo` +
          `?month=${monatParam}&federation=${NULIGA_FEDERATION}&location=${locationId}`,
      });

      monat++;
      if (monat > 12) {
        monat = 1;
        jahr++;
      }
    }
  }

  return urls;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractLocationName(html: string, locationId: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const heading = decodeHtml(h1Match[1])
      .replace(/\s*Hallenspielplan\s*$/i, "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim();
    if (heading) return heading;
  }
  return `nuLiga Halle ${locationId}`;
}

type NuligaEvent = {
  date: string;
  time: string;
  start: string;
  title: string;
  gameNumber: string | null;
  category: string | null;
  league: string | null;
  home: string;
  away: string;
  location: string;
  locationId: string;
};

// Analog zum bisherigen n8n-Code-Node "Events aufbereiten": Tabellenzeilen
// im nuLiga-HTML sind reines <td>-Markup ohne stabile Klassen, daher
// zeilenweise über Zellenanzahl/-inhalt statt über CSS-Selektoren geparst.
export function parseNuligaSeite(
  html: string,
  locationId: string
): { locationName: string; events: NuligaEvent[] } {
  const locationName = extractLocationName(html, locationId);
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
  const events: NuligaEvent[] = [];
  let currentDate: string | null = null;

  for (const row of rows) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      decodeHtml(m[1])
    );
    if (cells.length < 5) continue;

    const foundDate = cells.find((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c));
    if (foundDate) currentDate = foundDate;
    if (!currentDate) continue;

    const timeIndex = cells.findIndex((c) => /^\d{2}:\d{2}$/.test(c));
    if (timeIndex < 0) continue;

    const afterTime = cells.slice(timeIndex + 1);
    const gameNumberIndex = afterTime.findIndex((c) => /^\d+$/.test(c));
    if (gameNumberIndex < 0) continue;

    const gameNumber = afterTime[gameNumberIndex] || null;
    const category = afterTime[gameNumberIndex + 1] || null;
    const league = afterTime[gameNumberIndex + 2] || null;
    const home = afterTime[gameNumberIndex + 3];
    const away = afterTime[gameNumberIndex + 4];
    if (!league || !home || !away) continue;

    const dateMatch = currentDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!dateMatch) continue;
    const isoDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    const time = cells[timeIndex];

    events.push({
      date: isoDate,
      time,
      start: `${isoDate}T${time}:00+02:00`,
      title: `${home} – ${away}`,
      gameNumber,
      category,
      league,
      home,
      away,
      location: locationName,
      locationId,
    });
  }

  return { locationName, events };
}

export type NuligaHolFehler = { locationId: string; requestedMonth: string; grund: string };

// Ruft alle Monats-URLs ab (best effort — ein einzelner fehlgeschlagener
// Monat/Halle bricht den Gesamtlauf nicht ab) und aggregiert die Ergebnisse
// zum selben Block-Format wie der bisherige manuelle JSON-Export
// ({location, events}[], siehe rundenspiel-import.test.ts), als JSON-Text für
// parseRundenspielJson.
export async function holeNuligaJson(
  hallenIds: string[],
  anzahlMonateVorwaerts = 10,
  jetzt = new Date()
): Promise<{ json: string; fehler: NuligaHolFehler[] }> {
  const urls = baueMonatsUrls(hallenIds, anzahlMonateVorwaerts, jetzt);
  const fehler: NuligaHolFehler[] = [];

  const blockByLocation = new Map<
    string,
    { location: { id: string; name: string }; events: NuligaEvent[] }
  >();

  for (const eintrag of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let html: string;
      try {
        const response = await fetch(eintrag.url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        html = await response.text();
      } finally {
        clearTimeout(timeout);
      }

      const { locationName, events } = parseNuligaSeite(html, eintrag.locationId);

      const block = blockByLocation.get(eintrag.locationId) ?? {
        location: { id: eintrag.locationId, name: locationName },
        events: [],
      };
      block.events.push(...events);
      blockByLocation.set(eintrag.locationId, block);
    } catch (err) {
      fehler.push({
        locationId: eintrag.locationId,
        requestedMonth: eintrag.requestedMonth,
        grund: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { json: JSON.stringify([...blockByLocation.values()]), fehler };
}
