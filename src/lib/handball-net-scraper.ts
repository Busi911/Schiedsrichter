import "server-only";
import { berlinOffset } from "./format";

// Ab der 3. Liga führt der DHB den Spielbetrieb zentral über handball.net
// statt über die Landesverbands-nuLiga-Instanz (siehe nuliga-scraper.ts) —
// solche Spiele tauchen im nuLiga-Hallenspielplan gar nicht auf. Anders als
// nuLiga (ein Spielplan pro HALLE, alle dort stattfindenden Spiele egal
// welcher Verein) liefert handball.net einen Spielplan pro MANNSCHAFT
// (team_id), da es keine öffentliche "alle Spiele an dieser Halle"-Abfrage
// gibt. Ein Verein mit einer 3.-Liga-Mannschaft braucht daher eine
// team_id statt einer Hallen-ID.
const HANDBALL_NET_BASIS = "https://www.handball.net";

// handball.net ist eine Angular-SPA mit serverseitig gerendertem HTML +
// eingebettetem TransferState (siehe <script id="serverApp-state">), das
// beim Rendern intern dieselbe JSON-API abfragt, die hier direkt
// angesprochen wird. Die API liefert 403, wenn Origin/Referer fehlen (siehe
// Testabruf) — vermutlich ein einfacher Anti-Hotlinking-Check, kein echter
// Auth-Mechanismus (keine Cookies/Tokens nötig). Referer zeigt bewusst auf
// die Team-Seite der jeweils abgefragten Mannschaft.
function handballNetHeaders(teamId: string): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "application/json",
    Referer: `${HANDBALL_NET_BASIS}/team/${teamId}`,
    Origin: HANDBALL_NET_BASIS,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function alsDatum(jahr: number, monatNull: number, tag: number): string {
  return `${jahr}-${pad(monatNull + 1)}-${pad(tag)}`;
}

// Rollierendes Fenster wie bei baueMonatsUrls (nuliga-scraper.ts), aber ohne
// Monats-URL-Liste: die handball.net-API akzeptiert date_from/date_to direkt
// als Zeitraum, ein Abruf pro Mannschaft deckt das gesamte Fenster ab (keine
// monatsweise Paginierung wie beim nuLiga-HTML-Export nötig).
export function baueHandballNetZeitraum(
  jetzt = new Date(),
  anzahlMonateVorwaerts = 10,
  anzahlMonateRueckwaerts = 1
): { von: string; bis: string } {
  const jahr = jetzt.getFullYear();
  const monat = jetzt.getMonth();

  const vonDatum = new Date(jahr, monat - anzahlMonateRueckwaerts, 1);
  const bisDatum = new Date(jahr, monat + anzahlMonateVorwaerts + 1, 0);

  return {
    von: alsDatum(vonDatum.getFullYear(), vonDatum.getMonth(), vonDatum.getDate()),
    bis: alsDatum(bisDatum.getFullYear(), bisDatum.getMonth(), bisDatum.getDate()),
  };
}

// Gleiche Feldform wie NuligaEvent (nuliga-scraper.ts), damit dasselbe
// parseRundenspielJson (rundenspiel-import.ts) beide Quellen verarbeiten
// kann. "location"/"locationId" tragen hier die abgefragte Mannschaft statt
// einer Halle — für die UID-Bildung (bildeUid) reicht jeder eindeutige
// Namensraum, die exakte Bedeutung spielt dort keine Rolle.
export type HandballNetEvent = {
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
  zusatz: string | null;
  // Volle Namen aus referees, getrennt nach Rolle (siehe
  // gruppiereSchiedsrichterUndZeitnehmer unten) — anders als der nuLiga-
  // Kürzel-Abgleich (schiedsrichterKuerzel in RundenspielEreignis) liefert
  // handball.net vollständige Namen UND unterscheidet Schiedsrichter von
  // Zeitnehmer/Sekretär, daher zwei eigene Felder statt eines rohen
  // Textblocks im zusatz-Kanal.
  schiedsrichter: string | null;
  zeitnehmer: string | null;
};

function alsString(wert: unknown): string | undefined {
  return typeof wert === "string" && wert.length > 0 ? wert : undefined;
}

// Name UNSERER Mannschaft aus einem Match-Rohobjekt (local oder visitor, je
// nachdem wer die abgefragte team_id ist) — für die Block-Bezeichnung
// (siehe holeHandballNetJson) und unabhängig vom jeweiligen Gegner.
function ermittleEigenenTeamNamen(match: unknown, teamId: string): string | undefined {
  if (typeof match !== "object" || match === null) return undefined;
  const m = match as Record<string, unknown>;
  const local = m.local as Record<string, unknown> | undefined;
  const visitor = m.visitor as Record<string, unknown> | undefined;
  if (local?.id !== undefined && String(local.id) === teamId) return alsString(local.name);
  if (visitor?.id !== undefined && String(visitor.id) === teamId) return alsString(visitor.name);
  return undefined;
}

// Spiel-Datum kommt als ISO-String mit Offset (z.B.
// "2026-08-29T19:00:00+00:00"), das Offset bleibt aber unabhängig von
// Sommer-/Winterzeit konstant "+00:00" — beobachtet an Spielen im August UND
// Dezember desselben Exports. Das ist keine echte UTC-Zeit, sondern
// naive Ortszeit (Europe/Berlin) mit falsch angeheftetem Offset. Datum/Zeit
// werden daher als reiner Text entnommen und wie bei nuLiga mit dem
// korrekten Berlin-Offset neu zusammengesetzt (siehe berlinOffset).
function parseSpielDatum(wert: string): { date: string; time: string } | null {
  const match = wert.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) return null;
  return { date: match[1], time: match[2] };
}

// Nur ein einzelnes "Zahl:Zahl"-Segment, damit extrahiereErgebnis
// (rundenspiel-import.ts) das Ergebnis zuverlässig aus dem Zusatz-Kanal
// herauslöst — dieselbe Konvention wie beim nuLiga-Zusatz.
function formatiereErgebnis(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const r = result as Record<string, unknown>;
  if (typeof r.local !== "number" || typeof r.visitor !== "number") return null;
  return `${r.local}:${r.visitor}`;
}

type SchiedsrichterRoh = {
  first_name?: unknown;
  last_name?: unknown;
  role?: { name?: unknown };
};

// handball.net liefert volle Namen UND die Rolle (Schiedsrichter vs.
// Zeitnehmer/Sekretär) statt eines abgekürzten Kürzels wie nuLiga — anders
// als beim rohen nuLiga-Zusatz-Rest lohnt sich das Aufteilen: die Rolle
// unterscheidet zuverlässig zwei Gruppen, die im Verein unterschiedlichen
// Zuordnungen entsprechen (schiedsrichter vs. zeitnehmer/sekretaer, siehe
// terminZuordnungen in db/schema.ts). Beobachtet bislang nur "SCHIEDSRICHTER"
// als Rollenname (siehe handball-net-scraper.test.ts) — alles andere (auch
// unbekannte künftige Rollen) landet daher bewusst in der zweiten Gruppe,
// statt eine zweite exakte Rollenbezeichnung zu raten.
const SCHIEDSRICHTER_ROLLE_MUSTER = /schiedsrichter/i;

function gruppiereSchiedsrichterUndZeitnehmer(
  referees: unknown
): { schiedsrichter: string | null; zeitnehmer: string | null } {
  if (!Array.isArray(referees)) return { schiedsrichter: null, zeitnehmer: null };
  const schiedsrichterNamen: string[] = [];
  const zeitnehmerNamen: string[] = [];
  for (const eintrag of referees) {
    if (typeof eintrag !== "object" || eintrag === null) continue;
    const r = eintrag as SchiedsrichterRoh;
    const vorname = alsString(r.first_name);
    const nachname = alsString(r.last_name);
    if (!nachname) continue;
    const name = vorname ? `${vorname} ${nachname}` : nachname;
    const rolle = alsString(r.role?.name);
    if (rolle && SCHIEDSRICHTER_ROLLE_MUSTER.test(rolle)) {
      schiedsrichterNamen.push(name);
    } else {
      zeitnehmerNamen.push(name);
    }
  }
  return {
    schiedsrichter: schiedsrichterNamen.length ? schiedsrichterNamen.join(", ") : null,
    zeitnehmer: zeitnehmerNamen.length ? zeitnehmerNamen.join(", ") : null,
  };
}

// Ein handball.net-"match"-Objekt (siehe /api/new/matches) in dieselbe
// Eventform wie parseNuligaSeite (nuliga-scraper.ts) übersetzen.
export function parseHandballNetMatch(
  match: unknown,
  teamId: string
): HandballNetEvent | null {
  if (typeof match !== "object" || match === null) return null;
  const m = match as Record<string, unknown>;

  const datumRoh = alsString(m.date);
  const datum = datumRoh ? parseSpielDatum(datumRoh) : null;
  if (!datum) return null;

  const local = m.local as Record<string, unknown> | undefined;
  const visitor = m.visitor as Record<string, unknown> | undefined;
  const home = alsString(local?.name);
  const away = alsString(visitor?.name);
  if (!home || !away) return null;

  const phase = m.phase as Record<string, unknown> | undefined;
  const competition = phase?.competition as Record<string, unknown> | undefined;
  const league = alsString(competition?.name);

  // Die Halle des Gastgebers — bei Auswärtsspielen also die des Gegners,
  // nicht die eigene. Fällt mangels Angabe auf den Heimmannschaftsnamen
  // zurück statt auf einen leeren String.
  const field = m.field as Record<string, unknown> | undefined;
  const installation = field?.installation as Record<string, unknown> | undefined;
  const ort = alsString(field?.name) ?? alsString(installation?.name) ?? home;

  // "code" ist die vom DHB vergebene, öffentlich sichtbare Spielnummer
  // (z.B. "2627DHB3LERMC0102") und über die Saison stabil — analog zur
  // nuLiga-gameNumber, bleibt bei einer Terminverlegung unverändert. Fällt
  // auf die interne numerische ID zurück, falls code einmal fehlen sollte.
  const gameNumber = alsString(m.code) ?? alsString(String(m.id ?? ""));

  const { schiedsrichter, zeitnehmer } = gruppiereSchiedsrichterUndZeitnehmer(m.referees);

  return {
    date: datum.date,
    time: datum.time,
    start: `${datum.date}T${datum.time}:00${berlinOffset(datum.date)}`,
    title: `${home} – ${away}`,
    gameNumber: gameNumber ?? null,
    category: null,
    league: league ?? null,
    home,
    away,
    location: ort,
    locationId: teamId,
    zusatz: formatiereErgebnis(m.result),
    schiedsrichter,
    zeitnehmer,
  };
}

export type HandballNetHolFehler = { teamId: string; grund: string };

export type HandballNetDiagnose = {
  teamId: string;
  von: string;
  bis: string;
  httpStatus: number;
  spieleGefunden: number;
};

// Analog zu holeNuligaJson (nuliga-scraper.ts): ruft die API pro Mannschaft
// ab (best effort — eine fehlgeschlagene Mannschaft bricht den Gesamtlauf
// nicht ab) und aggregiert zum selben Block-Format ({location, events}[]),
// damit parseRundenspielJson unverändert weiterverwendet werden kann.
export async function holeHandballNetJson(
  teamIds: string[],
  anzahlMonateVorwaerts = 10,
  jetzt = new Date()
): Promise<{ json: string; fehler: HandballNetHolFehler[]; diagnose: HandballNetDiagnose[] }> {
  const { von, bis } = baueHandballNetZeitraum(jetzt, anzahlMonateVorwaerts);
  const fehler: HandballNetHolFehler[] = [];
  const diagnose: HandballNetDiagnose[] = [];
  const blocks: { location: { id: string; name: string }; events: HandballNetEvent[] }[] = [];

  for (const teamId of teamIds) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      let text: string;
      let httpStatus: number;
      try {
        const response = await fetch(
          `${HANDBALL_NET_BASIS}/api/new/matches?team_id=${encodeURIComponent(
            teamId
          )}&date_from=${von}&date_to=${bis}`,
          { signal: controller.signal, headers: handballNetHeaders(teamId) }
        );
        httpStatus = response.status;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        text = await response.text();
      } finally {
        clearTimeout(timeout);
      }

      const antwort = JSON.parse(text) as { success?: boolean; data?: unknown };
      if (!antwort.success || !Array.isArray(antwort.data)) {
        throw new Error("Unerwartetes Antwortformat (kein success/data-Array).");
      }

      const events = antwort.data
        .map((spiel) => parseHandballNetMatch(spiel, teamId))
        .filter((e): e is HandballNetEvent => e !== null);

      diagnose.push({ teamId, von, bis, httpStatus, spieleGefunden: events.length });

      const teamName =
        antwort.data.map((spiel) => ermittleEigenenTeamNamen(spiel, teamId)).find(Boolean) ??
        `handball.net Team ${teamId}`;
      blocks.push({ location: { id: teamId, name: teamName }, events });
    } catch (err) {
      fehler.push({ teamId, grund: err instanceof Error ? err.message : String(err) });
    }
  }

  return { json: JSON.stringify(blocks), fehler, diagnose };
}
