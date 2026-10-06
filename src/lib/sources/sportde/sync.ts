import { and, eq, gte, inArray, like, notInArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  ligaExterneIdentitaeten,
  ligaGruppen,
  ligaMannschaften,
  ligaQuellenAbrufe,
  ligaSpiele,
  ligaTabellenzeilen,
  ligaTeilnahmen,
} from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import { normalisiereMannschaft } from "@/lib/nuliga/normalisierung";
import type { LigaDb, SyncErgebnis } from "@/lib/nuliga/sync";
import { spielGeaendert, type SpielFelder } from "@/lib/nuliga/sync-hilfen";
import type { SpielStatus } from "@/lib/nuliga/types";
import { SPORTDE_LIGEN, type MatchStatus, type SportDeLiga } from "../match";
import { parseSpieltagSeite } from "./schedule-parser";
import type { HoleSeite, SportDeSpiel, SportDeTabellenzeile, SportDeTeam } from "./types";
import { spieltagPfad, vollUrl } from "./urls";

// Synchronisation der Quelle sport.de (1./2. Handball-Bundesliga) -> liga_*-Tabellen. Je LIGA und Saison (nicht je Verein): die Tabelle
// enthält alle Teams, Spiele und Teilnahmen aber nur die der Teams, die über `liga_externe_identitaet` einem BESTEHENDEN Verein zugeordnet
// sind (nie ein automatisch neuer Verein). Idempotent und fehlertolerant: eine unlesbare Seite ändert nichts (nur der Abruf-Status in
// `liga_quelle_abruf`), vorhandene Daten werden nie gelöscht, nur weil eine Seite einmal ausfällt. Schonend: nur FÄLLIGE Spieltagsseiten
// werden geholt (siehe `rundeFaellig`), nicht alle 34 bei jedem Lauf. Unabhängig von nuLiga/handball.net.

export const SPORTDE_VERBAND = "SPORTDE";
export const SPORTDE_QUELLE = "sportde";

// zuordnung = Stand der Team-Zuordnungen beim Abruf: wird ein Team später zugeordnet, müssen bereits geholte Seiten erneut gelesen werden, damit seine
// Spiele nachgeladen werden (sonst fehlten sie bis zum nächsten Auffrischen).
export type RundenMeta = { erstes: string | null; letztes: string | null; begonnen: number; beendet: number; gesamt: number; zuordnung?: string };

const BEGONNEN: MatchStatus[] = ["finished", "live", "halftime", "interrupted"];

export function berechneRundenMeta(spiele: SportDeSpiel[]): RundenMeta {
  const daten = spiele.map((s) => s.datum).filter((d): d is string => !!d).sort();
  return {
    erstes: daten[0] ?? null,
    letztes: daten.at(-1) ?? null,
    begonnen: spiele.filter((s) => (s.status && BEGONNEN.includes(s.status)) || (s.homeScore !== null && s.status !== null)).length,
    beendet: spiele.filter((s) => s.status === "finished").length,
    gesamt: spiele.length,
  };
}

export function leseRundenMeta(roh: unknown): RundenMeta | null {
  if (typeof roh !== "object" || roh === null) return null;
  const m = roh as Record<string, unknown>;
  const zahl = (x: unknown) => (typeof x === "number" ? x : 0);
  return { erstes: typeof m.erstes === "string" ? m.erstes : null, letztes: typeof m.letztes === "string" ? m.letztes : null, begonnen: zahl(m.begonnen), beendet: zahl(m.beendet), gesamt: zahl(m.gesamt), zuordnung: typeof m.zuordnung === "string" ? m.zuordnung : "" };
}

const MIN = 60_000;
const STUNDE = 60 * MIN;
const TAG = 24 * STUNDE;

// Wann ist eine Spieltagsseite wieder fällig? "nie" = noch nie erfolgreich geholt (Erstimport, nach und nach); "heiss" = Spieltag steht an oder läuft
// (alle 10 Minuten); "offen" = noch nicht alle Spiele gespielt, z.B. Verlegungen weit voraus (alle 6 Stunden); "ruhig" = alles gespielt (alle 7 Tage).
export type FaelligGrund = "nie" | "voll" | "heiss" | "offen" | "ruhig";

export function rundeFaellig(a: { letzterErfolgAm: Date | null; meta: RundenMeta | null } | undefined, jetzt: Date, voll: boolean, zuordnung?: string): FaelligGrund | null {
  if (!a || !a.letzterErfolgAm) return "nie";
  if (zuordnung !== undefined && (a.meta?.zuordnung ?? "") !== zuordnung) return "nie"; // Zuordnung hat sich seit dem Abruf geändert
  if (voll) return "voll";
  const alter = jetzt.getTime() - a.letzterErfolgAm.getTime();
  const m = a.meta;
  if (!m || m.gesamt === 0) return alter >= 6 * STUNDE ? "offen" : null;
  const laeuft = m.begonnen > m.beendet;
  const von = m.erstes ? Date.parse(`${m.erstes}T00:00:00Z`) - 6 * STUNDE : null;
  const bis = (m.letztes ?? m.erstes) ? Date.parse(`${m.letztes ?? m.erstes}T00:00:00Z`) + 30 * STUNDE : null;
  const nah = von !== null && bis !== null && jetzt.getTime() >= von && jetzt.getTime() <= bis;
  if (laeuft || nah) return alter >= 10 * MIN ? "heiss" : null;
  if (m.beendet < m.gesamt) return alter >= 6 * STUNDE ? "offen" : null;
  return alter >= 7 * TAG ? "ruhig" : null;
}

const RANG: Record<FaelligGrund, number> = { heiss: 0, nie: 1, voll: 1, offen: 2, ruhig: 3 };

export type SportDeSyncOptionen = {
  db: LigaDb;
  hole: HoleSeite;
  liga: SportDeLiga;
  saison: string; // "2025/26"
  jetzt?: Date;
  frist?: number; // Zeitpunkt (ms), bis zu dem neue Seiten angefangen werden dürfen
  voll?: boolean; // alle Spieltagsseiten neu holen
  nurTabelle?: boolean; // nur die Tabellenseite (z.B. zum Auflisten der Teams vor der Zuordnung)
  maxSeiten?: number;
};

const excluded = (spalte: AnyPgColumn) => sql`excluded.${sql.identifier(spalte.name)}`;

export function ligaStatus(status: MatchStatus): SpielStatus {
  if (status === "finished") return "gespielt";
  if (status === "postponed") return "verlegt";
  if (status === "cancelled") return "abgesagt";
  return "geplant"; // geplant, läuft, Pause, unterbrochen: Zwischenstände zeigt die Anzeige nie als Ergebnis
}

export function sportDeSpielFelder(s: SportDeSpiel): SpielFelder & { spieltag: number | null } {
  const status: MatchStatus = s.status ?? "scheduled";
  const hatStand = s.homeScore !== null && s.awayScore !== null;
  // Vor dem Anwurf ist ein "0:0" nur der Platzhalter — dann kein Ergebnis speichern.
  const mitStand = hatStand && status !== "scheduled" && status !== "postponed" && status !== "cancelled";
  return {
    datum: s.datum ?? "",
    uhrzeit: s.uhrzeit,
    beginn: s.startTime,
    urspruenglicherBeginn: null,
    halleName: s.venue,
    halleNummer: null,
    halleNuligaId: null,
    heimName: s.home.name,
    gastName: s.away.name,
    heimTeamtableId: s.home.externalId,
    gastTeamtableId: s.away.externalId,
    meetingId: null,
    // Verzeichnis der Spielseiten (ohne Domain): daraus entstehen Spielübersicht und Liveticker.
    berichtUrl: s.matchPfad,
    toreHeim: mitStand ? s.homeScore : null,
    toreGast: mitStand ? s.awayScore : null,
    halbzeitHeim: mitStand ? s.halftimeHomeScore : null,
    halbzeitGast: mitStand ? s.halftimeAwayScore : null,
    ergebnisBestaetigt: status === "finished",
    status: ligaStatus(status),
    spieltag: s.spieltag,
  };
}

// Mannschaft des Vereins zum Bundesliga-Team: die erste Männermannschaft. Hat der Verein unter diesem Schlüssel schon eine aktive Teilnahme einer
// anderen Quelle in derselben Saison, ist es vermutlich eine andere Mannschaft: getrennt führen ("… (1. HBL)") und melden, nie still vermischen.
async function sorgeFuerMannschaft(db: LigaDb, ligaVereinId: string, saison: string, ligaKurz: string, neu: () => void, warn: (t: string) => void) {
  const norm = normalisiereMannschaft("Männer");
  let schluessel = norm.schluessel;
  let slugBasis = norm.slug;
  let name = norm.anzeigename;
  const mit = await db.query.ligaMannschaften.findFirst({ where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.schluessel, schluessel)) });
  if (mit) {
    const fremd = await db
      .select({ id: ligaTeilnahmen.id })
      .from(ligaTeilnahmen)
      .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
      .where(and(eq(ligaTeilnahmen.mannschaftId, mit.id), eq(ligaTeilnahmen.aktiv, true), eq(ligaTeilnahmen.saison, saison), sql`${ligaGruppen.quelle} <> ${SPORTDE_QUELLE}`))
      .limit(1);
    if (fremd.length > 0) {
      warn(`Bundesliga-Mannschaft kollidiert mit "${mit.name}" aus einer anderen Quelle – getrennt geführt (${ligaKurz})`);
      schluessel = `${schluessel}:sportde`;
      slugBasis = `${slugBasis}-${slugKurz(ligaKurz)}`;
      name = `${name} (${ligaKurz})`;
    }
  }
  const stammdaten = { name, kategorie: norm.kategorie, geschlecht: norm.geschlecht, altersklasse: norm.altersklasse, untergruppe: norm.untergruppe, nummer: norm.nummer, aktiv: true };
  const vorhanden =
    schluessel === norm.schluessel ? mit : await db.query.ligaMannschaften.findFirst({ where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.schluessel, schluessel)) });
  if (vorhanden) {
    await db.update(ligaMannschaften).set({ aktiv: true }).where(eq(ligaMannschaften.id, vorhanden.id));
    return vorhanden;
  }
  let slug = slugBasis;
  for (let i = 2; await db.query.ligaMannschaften.findFirst({ where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.slug, slug)) }); i++) slug = `${slugBasis}-${i}`;
  const [angelegt] = await db.insert(ligaMannschaften).values({ ligaVereinId, slug, schluessel, ...stammdaten }).returning();
  neu();
  return angelegt;
}
const slugKurz = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

type GeholteRunde = { runde: number; spiele: SportDeSpiel[]; tabelle: SportDeTabellenzeile[]; teams: SportDeTeam[] };

export async function synchronisiereSportDe(opt: SportDeSyncOptionen): Promise<SyncErgebnis> {
  const { db, hole, liga, saison, jetzt = new Date(), voll = false, nurTabelle = false } = opt;
  const frist = opt.frist ?? Date.now() + 45_000;
  const maxSeiten = opt.maxSeiten ?? 40;
  const meta = SPORTDE_LIGEN[liga];
  let anfragen = 0;
  let neu = 0;
  let aktualisiert = 0;
  let problem = false;
  let unvollstaendig = false;
  const meldungen: string[] = [];
  const warn = (t: string) => meldungen.push(t);
  const fehlertext = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const ergebnis = (status: SyncErgebnis["status"]): SyncErgebnis => ({ status, anfragen, neu, aktualisiert, meldungen, unvollstaendig });
  const schluessel = (r: number) => `${liga}:${saison}:md${r}`;

  // Gruppe (je Liga und Saison)
  const gruppenWerte = { quelle: SPORTDE_QUELLE, championship: meta.name, saison, ligaName: meta.name, geschlecht: "m", altersklasse: null, spielklasse: meta.kurz, gruppe: null, istMeldeliste: false };
  const gruppenKey = `${liga}:${saison}`;
  let gruppe = await db.query.ligaGruppen.findFirst({ where: and(eq(ligaGruppen.verband, SPORTDE_VERBAND), eq(ligaGruppen.nuligaGroupId, gruppenKey)) });
  if (gruppe) await db.update(ligaGruppen).set(gruppenWerte).where(eq(ligaGruppen.id, gruppe.id));
  else {
    [gruppe] = await db.insert(ligaGruppen).values({ verband: SPORTDE_VERBAND, nuligaGroupId: gruppenKey, ...gruppenWerte }).returning();
    neu++;
  }
  const gruppeId = gruppe.id;

  // Zuordnung Team -> bestehender Verein (nur diese bekommen Mannschaft, Teilnahme und Spiele)
  const identitaeten = await db.query.ligaExterneIdentitaeten.findMany({ where: eq(ligaExterneIdentitaeten.quelle, SPORTDE_QUELLE) });
  const vereinJeTeam = new Map(identitaeten.map((i) => [i.externeId, i.ligaVereinId]));
  const zuordnungsStand = [...vereinJeTeam.keys()].sort().join(",");

  // Abruf-Status aller Spieltagsseiten dieser Liga/Saison
  const abrufZeilen = await db.select().from(ligaQuellenAbrufe).where(and(eq(ligaQuellenAbrufe.quelle, SPORTDE_QUELLE), like(ligaQuellenAbrufe.schluessel, `${gruppenKey}:md%`)));
  const abrufe = new Map<number, { letzterErfolgAm: Date | null; meta: RundenMeta | null }>();
  for (const a of abrufZeilen) {
    const r = Number(a.schluessel.split(":md")[1]);
    if (r) abrufe.set(r, { letzterErfolgAm: a.letzterErfolgAm, meta: leseRundenMeta(a.meta) });
  }
  const metaJeRunde = new Map<number, RundenMeta>([...abrufe].filter(([, a]) => a.meta).map(([r, a]) => [r, a.meta!]));
  const hoechsteBegonnene = () => [...metaJeRunde].filter(([, m]) => m.begonnen > 0).map(([r]) => r).sort((a, b) => b - a)[0] ?? 1;

  const speichereAbruf = async (r: number, ok: boolean, fehler: string | null, m: RundenMeta | null) => {
    const jetztDb = new Date();
    const werte = { quelle: SPORTDE_QUELLE, schluessel: schluessel(r), letzterVersuchAm: jetztDb, status: ok ? "ok" : "fehler", letzterFehler: ok ? null : fehler, quellUrl: vollUrl(spieltagPfad(liga, r)) };
    await db
      .insert(ligaQuellenAbrufe)
      .values({ ...werte, letzterErfolgAm: ok ? jetztDb : null, meta: m })
      .onConflictDoUpdate({
        target: [ligaQuellenAbrufe.quelle, ligaQuellenAbrufe.schluessel],
        set: ok ? { ...werte, letzterErfolgAm: jetztDb, meta: m } : { ...werte }, // ein Fehler lässt letzten Erfolg und Kennzahlen unberührt
      });
  };

  // Welche Seiten sind fällig? (Erstimport nach und nach, dann nur heiße/offene/ruhige Spieltage)
  const alleRunden = Array.from({ length: meta.spieltage }, (_, i) => i + 1);
  let kandidaten: number[];
  if (nurTabelle) kandidaten = [hoechsteBegonnene()];
  else {
    kandidaten = alleRunden
      .map((r) => ({ r, grund: rundeFaellig(abrufe.get(r), jetzt, voll, zuordnungsStand) }))
      .filter((x): x is { r: number; grund: FaelligGrund } => x.grund !== null)
      // Gleicher Rang: die am längsten nicht geholte Seite zuerst (bei knappem Zeitbudget kommen so alle nacheinander dran)
      .sort((a, b) => RANG[a.grund] - RANG[b.grund] || (abrufe.get(a.r)?.letzterErfolgAm?.getTime() ?? 0) - (abrufe.get(b.r)?.letzterErfolgAm?.getTime() ?? 0) || a.r - b.r)
      .map((x) => x.r);
  }

  const geholt = new Map<number, GeholteRunde>();
  const ladeRunde = async (r: number): Promise<boolean> => {
    if (geholt.has(r)) return true;
    if (Date.now() > frist - 2_500 || anfragen >= maxSeiten) {
      unvollstaendig = true;
      return false;
    }
    try {
      anfragen++;
      const html = await hole(spieltagPfad(liga, r));
      const p = parseSpieltagSeite(html, { liga, saison, spieltag: r });
      const m = { ...berechneRundenMeta(p.spiele), zuordnung: zuordnungsStand };
      metaJeRunde.set(r, m);
      geholt.set(r, { runde: r, spiele: p.spiele, tabelle: p.tabelle, teams: p.teams });
      for (const w of p.warnungen.slice(0, 3)) warn(`${meta.kurz} Spieltag ${r}: ${w}`);
      await speichereAbruf(r, true, null, m);
      return true;
    } catch (err) {
      problem = true;
      warn(`${meta.kurz} Spieltag ${r}: ${fehlertext(err)}`);
      await speichereAbruf(r, false, fehlertext(err), null).catch(() => undefined);
      return false;
    }
  };
  for (const r of kandidaten) await ladeRunde(r);

  // Tabelle: die Seite des aktuellsten begonnenen Spieltags (nicht 34-mal importieren)
  const tabellenRunde = hoechsteBegonnene();
  let tabelle: SportDeTabellenzeile[] | null = geholt.get(tabellenRunde)?.tabelle ?? null;
  if (!tabelle || tabelle.length === 0) {
    const frisch = gruppe.tabelleSynchronisiertAm !== null && jetzt.getTime() - gruppe.tabelleSynchronisiertAm.getTime() < 15 * MIN;
    if (!frisch && !geholt.has(tabellenRunde) && (await ladeRunde(tabellenRunde))) tabelle = geholt.get(tabellenRunde)?.tabelle ?? null;
  }
  if (tabelle && tabelle.length === 0) tabelle = null;

  if (geholt.size === 0) {
    if (kandidaten.length === 0) return ergebnis("erfolgreich"); // nichts fällig
    return ergebnis("fehler"); // alle fälligen Seiten fehlgeschlagen: nichts geändert
  }

  // Teams (aus allen gelesenen Seiten; die Tabellenseite liefert alle Teams der Liga)
  const teams = new Map<string, SportDeTeam>();
  for (const g of geholt.values()) for (const t of g.teams) teams.set(t.externalId, { ...(teams.get(t.externalId) ?? t), ...t, logoUrl: t.logoUrl ?? teams.get(t.externalId)?.logoUrl ?? null });

  // Tabelle speichern
  if (tabelle) {
    await db
      .insert(ligaTabellenzeilen)
      .values(tabelle.map((z) => ({ gruppeId, nuligaTeamtableId: z.teamId, name: z.name, rang: z.rang, spiele: z.spiele, siege: z.siege, unentschieden: z.unentschieden, niederlagen: z.niederlagen, torePlus: z.torePlus, toreMinus: z.toreMinus, punktePlus: z.punktePlus, punkteMinus: z.punkteMinus })))
      .onConflictDoUpdate({
        target: [ligaTabellenzeilen.gruppeId, ligaTabellenzeilen.nuligaTeamtableId],
        set: {
          name: excluded(ligaTabellenzeilen.name),
          rang: excluded(ligaTabellenzeilen.rang),
          spiele: excluded(ligaTabellenzeilen.spiele),
          siege: excluded(ligaTabellenzeilen.siege),
          unentschieden: excluded(ligaTabellenzeilen.unentschieden),
          niederlagen: excluded(ligaTabellenzeilen.niederlagen),
          torePlus: excluded(ligaTabellenzeilen.torePlus),
          toreMinus: excluded(ligaTabellenzeilen.toreMinus),
          punktePlus: excluded(ligaTabellenzeilen.punktePlus),
          punkteMinus: excluded(ligaTabellenzeilen.punkteMinus),
        },
      });
    await db.delete(ligaTabellenzeilen).where(and(eq(ligaTabellenzeilen.gruppeId, gruppeId), notInArray(ligaTabellenzeilen.nuligaTeamtableId, tabelle.map((z) => z.teamId))));
    await db.update(ligaGruppen).set({ tabelleSynchronisiertAm: new Date() }).where(eq(ligaGruppen.id, gruppeId));
  }

  const alleSpiele = [...geholt.values()].flatMap((g) => g.spiele);
  const bekannteTeams = new Set([...teams.keys(), ...alleSpiele.flatMap((s) => [s.home.externalId, s.away.externalId])]);
  const ohneVerein = [...teams.keys()].filter((id) => !vereinJeTeam.has(id));
  if (ohneVerein.length > 0) warn(`${meta.kurz}: ${ohneVerein.length} Team(s) keinem Verein zugeordnet (kein neuer Verein angelegt)`);
  const zugeordnet = [...vereinJeTeam.keys()].filter((id) => bekannteTeams.has(id));
  const nameVon = (id: string) => teams.get(id)?.name ?? tabelle?.find((z) => z.teamId === id)?.name ?? alleSpiele.map((s) => (s.home.externalId === id ? s.home.name : s.away.externalId === id ? s.away.name : null)).find(Boolean) ?? id;

  for (const teamId of zugeordnet) {
    const ligaVereinId = vereinJeTeam.get(teamId)!;
    const team = teams.get(teamId);
    const zeile = tabelle?.find((z) => z.teamId === teamId);
    const name = nameVon(teamId);
    try {
      if (team) {
        await db
          .update(ligaExterneIdentitaeten)
          .set({ externerCode: team.slug, name: team.name, ...(team.logoUrl ? { logoUrl: team.logoUrl } : {}), aktualisiertAm: new Date() })
          .where(and(eq(ligaExterneIdentitaeten.quelle, SPORTDE_QUELLE), eq(ligaExterneIdentitaeten.externeId, teamId)));
      }
      const mannschaft = await sorgeFuerMannschaft(db, ligaVereinId, saison, meta.kurz, () => neu++, warn);
      const vorher = await db.query.ligaTeilnahmen.findFirst({ where: and(eq(ligaTeilnahmen.mannschaftId, mannschaft.id), eq(ligaTeilnahmen.gruppeId, gruppeId)) });
      const werte = {
        saison,
        nuligaTeamtableId: teamId,
        nuligaName: name,
        rang: zeile?.rang ?? vorher?.rang ?? null,
        punktePlus: zeile?.punktePlus ?? vorher?.punktePlus ?? null,
        punkteMinus: zeile?.punkteMinus ?? vorher?.punkteMinus ?? null,
        aktiv: true,
        synchronisiertAm: new Date(),
      };
      if (vorher) await db.update(ligaTeilnahmen).set(werte).where(eq(ligaTeilnahmen.id, vorher.id));
      else {
        await db.insert(ligaTeilnahmen).values({ mannschaftId: mannschaft.id, gruppeId, ...werte });
        neu++;
      }
    } catch (err) {
      warn(`Team ${name}: ${fehlertext(err)}`);
    }
  }

  // Spiele der zugeordneten Teams (Schlüssel: Gruppe + sport.de-Match-ID als spielcode)
  const meine = new Set(zugeordnet);
  const gueltig = alleSpiele.filter((s) => s.datum);
  const eigene = gueltig.filter((s) => meine.has(s.home.externalId) || meine.has(s.away.externalId));
  const status = () => ergebnis(problem || meldungen.some((m) => m.startsWith("Team ")) ? "teilweise" : "erfolgreich");
  if (eigene.length === 0) {
    if (zugeordnet.length > 0) warn(`${meta.kurz}: keine Spiele der zugeordneten Teams auf den geholten Seiten`);
    return status();
  }
  const codes = eigene.map((s) => s.externalMatchId);
  const bestehende = await db.query.ligaSpiele.findMany({ where: and(eq(ligaSpiele.gruppeId, gruppeId), inArray(ligaSpiele.spielcode, codes)) });
  const nachCode = new Map(bestehende.map((b) => [b.spielcode, b]));
  const zuSchreiben: (typeof ligaSpiele.$inferInsert)[] = [];
  for (const s of eigene) {
    const felder = sportDeSpielFelder(s);
    const alt = nachCode.get(s.externalMatchId);
    const { spieltag, ...ohneSpieltag } = felder;
    if (alt && !spielGeaendert({ ...alt } as SpielFelder, ohneSpieltag) && alt.spieltag === spieltag) continue;
    zuSchreiben.push({ gruppeId, spielcode: s.externalMatchId, quelle: SPORTDE_QUELLE, externeId: s.externalMatchId, ...felder });
    if (alt) aktualisiert++;
    else neu++;
  }
  if (zuSchreiben.length > 0) {
    const spalten = Object.keys(zuSchreiben[0]).filter((c) => c !== "gruppeId" && c !== "spielcode") as (keyof typeof ligaSpiele.$inferInsert)[];
    await db
      .insert(ligaSpiele)
      .values(zuSchreiben)
      .onConflictDoUpdate({
        target: [ligaSpiele.gruppeId, ligaSpiele.spielcode],
        set: { ...Object.fromEntries(spalten.map((c) => [c, excluded(ligaSpiele[c as keyof typeof ligaSpiele] as never)])), synchronisiertAm: new Date() },
      });
  }
  // Künftige Spiele der zugeordneten Teams aus den JETZT gelesenen Spieltagen, die sport.de dort nicht mehr führt, entfernen (andere Spieltage
  // und ein ausgefallener Abruf lassen die vorhandenen Daten unberührt).
  const gelesenRunden = [...geholt.keys()];
  const alleCodes = gueltig.map((s) => s.externalMatchId);
  await db.delete(ligaSpiele).where(
    and(
      eq(ligaSpiele.gruppeId, gruppeId),
      eq(ligaSpiele.quelle, SPORTDE_QUELLE),
      inArray(ligaSpiele.spieltag, gelesenRunden),
      gte(ligaSpiele.datum, tagKey(jetzt)),
      notInArray(ligaSpiele.spielcode, alleCodes),
      or(inArray(ligaSpiele.heimTeamtableId, [...meine]), inArray(ligaSpiele.gastTeamtableId, [...meine]))
    )
  );
  return status();
}
