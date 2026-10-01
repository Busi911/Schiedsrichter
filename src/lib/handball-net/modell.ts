import { parseKategorien } from "@/lib/nuliga/zusatzquellen";
import { berlinOffset } from "@/lib/format";
import { normalisiereMannschaft, type NormalisierteMannschaft } from "@/lib/nuliga/normalisierung";
import type { SpielStatus } from "@/lib/nuliga/types";

// Reine Funktionen für die zweite Datenquelle handball.net (DHB-Wettbewerbe:
// 3. Liga, Jugendbundesliga, Qualifikationen). Die API (/api/new/…) liefert
// in denselben Antworten auch Personendaten (Schiedsrichter, Zeitnehmer,
// Mannschaftsverantwortliche, Kontaktdaten der Vereine). Diese Typen sind
// deshalb — wie bei nuLiga — eine WHITELIST: was hier kein Feld hat, wird
// nie gelesen und kann nie persistiert werden.

export type HnetTeam = {
  id: string;
  name: string;
  gender: "m" | "w" | null;
  ageCategory: string | null; // "ERWACHSENE", "A-JUGEND", …
  clubId: string | null;
  clubName: string | null;
};

export type HnetPhase = {
  id: string;
  name: string; // "Süd-West"
  competitionId: string;
  competitionName: string; // "3. Liga Männer"
  hatTabelle: boolean;
};

export type HnetSpiel = {
  id: string;
  code: string | null; // offizielle Spielnummer
  datum: string; // yyyy-mm-dd (Ortszeit)
  uhrzeit: string | null; // HH:MM
  beginn: Date;
  status: SpielStatus;
  beendet: boolean;
  heim: { id: string; name: string; clubName: string | null };
  gast: { id: string; name: string; clubName: string | null };
  toreHeim: number | null;
  toreGast: number | null;
  halle: { id: string | null; name: string | null } | null;
};

export type HnetSaison = { id: string; label: string; start: string; ende: string };

type Roh = Record<string, unknown>;

function obj(x: unknown): Roh | null {
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Roh) : null;
}
function text(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}
function idText(x: unknown): string | null {
  if (typeof x === "number" && Number.isFinite(x)) return String(x);
  return text(x);
}

export function parseTeam(roh: unknown): HnetTeam | null {
  const d = obj(roh);
  const id = d && idText(d.id);
  const name = d && text(d.name);
  if (!d || !id || !name) return null;
  const club = obj(d.club);
  const g = obj(d.gender)?.id;
  return {
    id,
    name,
    gender: g === "M" ? "m" : g === "F" || g === "W" ? "w" : null,
    ageCategory: text(obj(d.age_category)?.name),
    clubId: idText(club?.id),
    clubName: text(club?.name),
  };
}

export function parsePhasen(roh: unknown): HnetPhase[] {
  if (!Array.isArray(roh)) return [];
  const ergebnis: HnetPhase[] = [];
  for (const e of roh) {
    const p = obj(e);
    const comp = obj(p?.competition);
    const id = p && idText(p.id);
    const compName = text(comp?.name);
    if (!p || !id || !compName) continue;
    ergebnis.push({
      id,
      name: text(p.name) ?? "",
      competitionId: idText(comp?.id) ?? id,
      competitionName: compName,
      hatTabelle: p.has_standings !== false,
    });
  }
  return ergebnis;
}

// "Saison 2026/2027" -> "2026/27" (Format der liga_*-Tabellen).
export function saisonLabel(name: string): string | null {
  const m = name.match(/(\d{4})\s*\/\s*(\d{2,4})/);
  return m ? `${m[1]}/${m[2].slice(-2)}` : null;
}

export function parseSaisons(roh: unknown): HnetSaison[] {
  if (!Array.isArray(roh)) return [];
  const ergebnis: HnetSaison[] = [];
  for (const e of roh) {
    const s = obj(e);
    const id = s && idText(s.id);
    const label = s && text(s.name) && saisonLabel(String(s.name));
    const start = s && text(s.start_date);
    const ende = s && text(s.end_date);
    if (id && label && start && ende) ergebnis.push({ id, label, start, ende });
  }
  return ergebnis;
}

// Statusmapping: bevorzugt die strukturierten Flags (is_finished/is_sanction),
// bei Sonderfällen der Statustext (die API liefert ihn teils spanisch,
// "Pendiente"). Unbekanntes bleibt "geplant" — ohne Ergebnis wird nie etwas
// als gespielt dargestellt.
export function mappeStatus(roh: unknown): SpielStatus {
  const s = obj(roh);
  if (!s) return "geplant";
  if (s.is_sanction === true) return "nicht_angetreten";
  if (s.is_finished === true) return "gespielt";
  const t = `${text(s.name) ?? ""} ${text(s.short_name) ?? ""}`.toLowerCase();
  if (/aplaz|verleg|postpon|verschob|suspend/.test(t)) return "verlegt";
  if (/cancel|anul|abgesag|ausgefall/.test(t)) return "abgesagt";
  return "geplant";
}

// Tore: Zahl oder (je nach Antwortform) ein Objekt mit Endstand.
function tor(x: unknown): number | null {
  if (typeof x === "number" && Number.isInteger(x) && x >= 0) return x;
  const o = obj(x);
  if (o) {
    for (const k of ["total", "final", "goals", "score", "value"]) {
      const v = tor(o[k]);
      if (v !== null) return v;
    }
  }
  return null;
}

// Das API-Datum ist Berliner Ortszeit mit fälschlich angehängtem "+00:00"
// (siehe handball-net-scraper.ts) — Datum/Uhrzeit also als Text lesen.
export function parseSpiel(roh: unknown): HnetSpiel | null {
  const m = obj(roh);
  const datumRoh = m && text(m.date);
  const dm = datumRoh?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  const local = obj(m?.local);
  const visitor = obj(m?.visitor);
  const id = m && idText(m.id);
  if (!m || !dm || !id || !local || !visitor) return null;
  const heimId = idText(local.id);
  const gastId = idText(visitor.id);
  const heimName = text(local.name);
  const gastName = text(visitor.name);
  if (!heimId || !gastId || !heimName || !gastName) return null;

  const status = mappeStatus(m.status);
  const flags = obj(m.status);
  const beendet = flags?.is_finished === true || flags?.is_sanction === true;
  const ergebnis = obj(m.result);
  const heimTore = beendet ? tor(ergebnis?.local) : null;
  const gastTore = beendet ? tor(ergebnis?.visitor) : null;
  const hatErgebnis = heimTore !== null && gastTore !== null;

  const feld = obj(m.field);
  const halle = obj(feld?.installation);
  const halleName = text(halle?.name) ?? text(feld?.name);
  return {
    id,
    code: text(m.code),
    datum: dm[1],
    uhrzeit: dm[2],
    beginn: new Date(`${dm[1]}T${dm[2]}:00${berlinOffset(dm[1])}`),
    status,
    beendet,
    heim: { id: heimId, name: heimName, clubName: text(obj(local.club)?.name) },
    gast: { id: gastId, name: gastName, clubName: text(obj(visitor.club)?.name) },
    toreHeim: hatErgebnis ? heimTore : null,
    toreGast: hatErgebnis ? gastTore : null,
    halle: halleName ? { id: idText(halle?.id), name: halleName } : null,
  };
}

export function parseSpiele(roh: unknown): HnetSpiel[] {
  if (!Array.isArray(roh)) return [];
  return roh.map(parseSpiel).filter((s): s is HnetSpiel => s !== null);
}

const alnum = (t: string) => t.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "");

// handball.net schreibt Teamnamen in Großbuchstaben ("TUS 82 OPLADEN"). Ist
// der Name der Vereinsname plus Mannschaftsnummer, wird die Schreibweise des
// Vereins verwendet ("TuS 82 Opladen", "HSG Dutenhofen/Münchholzhausen II").
export function schoenerTeamname(teamName: string, clubName: string | null): string {
  if (!clubName) return teamName;
  const m = teamName.match(/^(.*\S)(\s+(?:VI|V|IV|III|II|\d{1,2}))$/);
  const basis = m ? m[1] : teamName;
  const suffix = m ? m[2] : "";
  return alnum(basis) === alnum(clubName) ? `${clubName}${suffix}` : teamName;
}

// Mannschaftsidentität (Kategorie, Altersklasse, Nummer) aus Geschlecht,
// Altersklasse und Namenssuffix — nicht aus dem Namen allein und mit
// derselben Schlüsselbildung wie bei nuLiga (normalisiereMannschaft).
export function normalisiereHnetTeam(team: HnetTeam): NormalisierteMannschaft {
  const nummer = team.name.match(/\s(VI|V|IV|III|II)$/)?.[1] ?? team.name.match(/\s(\d{1,2})$/)?.[1];
  const suffix = nummer ? ` ${nummer}` : "";
  const alter = team.ageCategory?.toUpperCase() ?? "";
  let basis: string | null = null;
  if (alter.includes("ERWACHSEN")) {
    basis = team.gender === "w" ? "Frauen" : team.gender === "m" ? "Männer" : null;
  } else {
    const ak = alter.match(/\b([A-F])[- ]?JUGEND\b|\bJUGEND[- ]([A-F])\b/);
    const buchstabe = ak?.[1] ?? ak?.[2];
    if (buchstabe && team.gender) {
      basis = `${team.gender === "m" ? "männliche" : "weibliche"} Jugend ${buchstabe}`;
    }
  }
  return normalisiereMannschaft(basis ? `${basis}${suffix}` : team.name);
}

export type TabellenEintrag = {
  teamId: string;
  name: string;
  rang: number;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  torePlus: number;
  toreMinus: number;
  punktePlus: number;
  punkteMinus: number;
};

// Tabelle aus den beendeten Spielen einer Phase (2 Punkte Sieg, 1 Punkt
// Unentschieden — Wertung im DHB-Spielbetrieb). Rang: Punkte, Tordifferenz,
// erzielte Tore; der direkte Vergleich wird NICHT berücksichtigt (die
// Tabelle ist daher bei Punktgleichheit eine Näherung).
export function berechneTabelle(spiele: HnetSpiel[]): TabellenEintrag[] {
  const zeilen = new Map<string, TabellenEintrag>();
  const eintrag = (t: { id: string; name: string; clubName: string | null }) => {
    let z = zeilen.get(t.id);
    if (!z) {
      z = {
        teamId: t.id,
        name: schoenerTeamname(t.name, t.clubName),
        rang: 0,
        spiele: 0,
        siege: 0,
        unentschieden: 0,
        niederlagen: 0,
        torePlus: 0,
        toreMinus: 0,
        punktePlus: 0,
        punkteMinus: 0,
      };
      zeilen.set(t.id, z);
    }
    return z;
  };
  for (const s of spiele) {
    const h = eintrag(s.heim);
    const g = eintrag(s.gast);
    if (s.toreHeim === null || s.toreGast === null) continue;
    h.spiele++;
    g.spiele++;
    h.torePlus += s.toreHeim;
    h.toreMinus += s.toreGast;
    g.torePlus += s.toreGast;
    g.toreMinus += s.toreHeim;
    if (s.toreHeim > s.toreGast) {
      h.siege++;
      g.niederlagen++;
      h.punktePlus += 2;
      g.punkteMinus += 2;
    } else if (s.toreHeim < s.toreGast) {
      g.siege++;
      h.niederlagen++;
      g.punktePlus += 2;
      h.punkteMinus += 2;
    } else {
      h.unentschieden++;
      g.unentschieden++;
      h.punktePlus++;
      g.punktePlus++;
      h.punkteMinus++;
      g.punkteMinus++;
    }
  }
  const sortiert = [...zeilen.values()].sort(
    (a, b) =>
      b.punktePlus - a.punktePlus ||
      b.torePlus - b.toreMinus - (a.torePlus - a.toreMinus) ||
      b.torePlus - a.torePlus ||
      a.name.localeCompare(b.name, "de")
  );
  sortiert.forEach((z, i) => (z.rang = i + 1));
  return sortiert;
}

// Offizielle Tabelle aus /api/new/standings?phase_id=… . Whitelist: nur Rang,
// Mannschaft und Zahlen — die Antwort enthält je Verein auch Adresse, Telefon
// und E-Mail, die nie übernommen werden. Punkte kommen als Gesamtsumme
// (2 für Sieg, 1 für Unentschieden), Minuspunkte ergeben sich daraus.
// Unplausible Zeilen verwerfen die ganze Tabelle (Rückfall: Berechnung).
export function parseOffizielleTabelle(antwort: unknown): TabellenEintrag[] | null {
  const data = (antwort as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const zahl = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const zeilen: TabellenEintrag[] = [];
  for (const roh of data) {
    const r = roh as Record<string, unknown>;
    const team = r?.team as { id?: unknown; name?: unknown; club?: { name?: unknown } | null } | undefined;
    const id = team?.id;
    const rang = zahl(r?.position);
    const spiele = zahl(r?.played);
    const siege = zahl(r?.won);
    const unentschieden = zahl(r?.drawn);
    const niederlagen = zahl(r?.lost);
    const torePlus = zahl(r?.goals_for);
    const toreMinus = zahl(r?.goals_against);
    const punkte = zahl(r?.points);
    if (
      (typeof id !== "number" && typeof id !== "string") ||
      typeof team?.name !== "string" ||
      rang === null || spiele === null || siege === null || unentschieden === null ||
      niederlagen === null || torePlus === null || toreMinus === null || punkte === null ||
      siege + unentschieden + niederlagen !== spiele
    ) {
      return null;
    }
    zeilen.push({
      teamId: String(id),
      name: schoenerTeamname(team.name, typeof team.club?.name === "string" ? team.club.name : null),
      rang,
      spiele,
      siege,
      unentschieden,
      niederlagen,
      torePlus,
      toreMinus,
      punktePlus: punkte,
      punkteMinus: Math.max(0, 2 * spiele - punkte),
    });
  }
  return zeilen.sort((a, b) => a.rang - b.rang);
}

// Darf ein Team übernommen werden? Teams, die über die Vereins-ID gefunden
// werden, müssen zu diesem Verein gehören. Manuell hinterlegte Team-IDs sind
// dagegen immer erlaubt: so lässt sich z.B. eine Jugendspielgemeinschaft
// anbinden, die bei handball.net unter einem Partnerverein läuft.
export function teamUebernehmen(
  teamClubId: string | null,
  vereinClubId: string | null,
  manuelleTeamIds: string[],
  teamId: string
): boolean {
  if (manuelleTeamIds.includes(teamId)) return true;
  return !(vereinClubId && teamClubId && teamClubId !== vereinClubId);
}

// Filter einer Zusatzquelle (Partnerverein bei handball.net, z.B. eine
// Jugendspielgemeinschaft in der Jugendbundesliga): Kategorie (wie bei nuLiga,
// liga_kategorie) und optional ein Namensteil im Team- oder Vereinsnamen.
export function passtZumHnetFilter(
  team: HnetTeam,
  filter: { kategorien: string; nameEnthaelt: string | null }
): boolean {
  const kategorien = parseKategorien(filter.kategorien);
  if (kategorien.length > 0 && !kategorien.includes(normalisiereHnetTeam(team).kategorie)) return false;
  const teil = filter.nameEnthaelt?.trim().toLowerCase();
  if (teil && !`${team.name} ${team.clubName ?? ""}`.toLowerCase().includes(teil)) return false;
  return true;
}
