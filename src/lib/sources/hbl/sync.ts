import { and, eq, gte, inArray, notInArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  ligaExterneIdentitaeten,
  ligaGruppen,
  ligaMannschaften,
  ligaSpiele,
  ligaTabellenzeilen,
  ligaTeilnahmen,
} from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import { normalisiereMannschaft } from "@/lib/nuliga/normalisierung";
import type { LigaDb, SyncErgebnis } from "@/lib/nuliga/sync";
import { spielGeaendert, type SpielFelder } from "@/lib/nuliga/sync-hilfen";
import type { SpielStatus } from "@/lib/nuliga/types";
import { HBL_WETTBEWERBE, type HblWettbewerb, type MatchStatus } from "../match";
import { holeSpielplan } from "./matches";
import { holeTabelle } from "./standings";
import { holeTeams } from "./teams";
import type { HblEndpunkte, HblParser, HblSpiel, HblTabellenzeile, HblTeam, HblTeamRef, HoleHbl } from "./types";

// Synchronisation der HBL-Quelle -> liga_*-Tabellen. Je WETTBEWERB und Saison (nicht je Verein): die Tabelle enthält alle
// Teams, Spiele und Teilnahmen aber nur die der Teams, die über `liga_externe_identitaet` einem bestehenden Verein
// zugeordnet sind (nie ein automatisch neuer Verein). Idempotent, fehlertolerant: eine unlesbare Antwort ändert nichts,
// ein leerer Spielplan löscht nichts. Unabhängig von nuLiga/handball.net (eigener Verband "HBL", eigene Quelle "hbl").

export const HBL_VERBAND = "HBL";
export const HBL_QUELLE = "hbl";

export type HblSyncOptionen = {
  db: LigaDb;
  hole: HoleHbl;
  endpunkte: HblEndpunkte;
  parser: HblParser;
  wettbewerb: HblWettbewerb;
  saison: string; // "2026/27"
  jetzt?: Date;
  // Teamübersicht (Logos, Kürzel) mitladen; sonst nur, wenn die Tabelle allein nicht reicht, um Namen den UUIDs zuzuordnen.
  mitTeams?: boolean;
};

const excluded = (spalte: AnyPgColumn) => sql`excluded.${sql.identifier(spalte.name)}`;

export function ligaStatus(status: MatchStatus): SpielStatus {
  if (status === "finished") return "gespielt";
  if (status === "postponed") return "verlegt";
  if (status === "cancelled") return "abgesagt";
  return "geplant"; // geplant, läuft, Halbzeit, unterbrochen: Zwischenstände zeigt die Anzeige nie als Ergebnis
}

export function hblSpielFelder(s: HblSpiel): SpielFelder {
  const hatStand = s.homeScore !== null && s.awayScore !== null;
  const status: MatchStatus = s.status ?? "scheduled";
  // Vor dem Anwurf ist ein "0:0" nur der Platzhalter — dann kein Ergebnis speichern.
  const mitStand = hatStand && status !== "scheduled" && status !== "postponed" && status !== "cancelled";
  return {
    datum: s.datum,
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
    berichtUrl: null,
    toreHeim: mitStand ? s.homeScore : null,
    toreGast: mitStand ? s.awayScore : null,
    halbzeitHeim: mitStand ? s.halftimeHomeScore : null,
    halbzeitGast: mitStand ? s.halftimeAwayScore : null,
    ergebnisBestaetigt: status === "finished",
    status: ligaStatus(status),
  };
}

// Mannschaft des Vereins zum HBL-Team: die erste Männermannschaft. Hat der Verein unter diesem Schlüssel schon eine
// aktive Teilnahme einer anderen Quelle in derselben Saison, ist es vermutlich eine andere Mannschaft: getrennt führen
// ("… (HBL)") und melden, nie still vermischen.
async function sorgeFuerMannschaft(db: LigaDb, ligaVereinId: string, saison: string, neu: () => void, warn: (t: string) => void) {
  const norm = normalisiereMannschaft("Männer");
  let schluessel = norm.schluessel;
  let slugBasis = norm.slug;
  let name = norm.anzeigename;
  const mit = await db.query.ligaMannschaften.findFirst({
    where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.schluessel, schluessel)),
  });
  if (mit) {
    const fremd = await db
      .select({ id: ligaTeilnahmen.id })
      .from(ligaTeilnahmen)
      .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
      .where(
        and(
          eq(ligaTeilnahmen.mannschaftId, mit.id),
          eq(ligaTeilnahmen.aktiv, true),
          eq(ligaTeilnahmen.saison, saison),
          sql`${ligaGruppen.quelle} <> ${HBL_QUELLE}`
        )
      )
      .limit(1);
    if (fremd.length > 0) {
      warn(`HBL-Mannschaft kollidiert mit "${mit.name}" aus einer anderen Quelle – getrennt geführt (HBL)`);
      schluessel = `${schluessel}:hbl`;
      slugBasis = `${slugBasis}-hbl`;
      name = `${name} (HBL)`;
    }
  }
  const stammdaten = { name, kategorie: norm.kategorie, geschlecht: norm.geschlecht, altersklasse: norm.altersklasse, untergruppe: norm.untergruppe, nummer: norm.nummer, aktiv: true };
  const vorhanden =
    schluessel === norm.schluessel
      ? mit
      : await db.query.ligaMannschaften.findFirst({
          where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.schluessel, schluessel)),
        });
  if (vorhanden) {
    await db.update(ligaMannschaften).set({ aktiv: true }).where(eq(ligaMannschaften.id, vorhanden.id));
    return vorhanden;
  }
  let slug = slugBasis;
  for (
    let i = 2;
    await db.query.ligaMannschaften.findFirst({ where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.slug, slug)) });
    i++
  ) {
    slug = `${slugBasis}-${i}`;
  }
  const [angelegt] = await db.insert(ligaMannschaften).values({ ligaVereinId, slug, schluessel, ...stammdaten }).returning();
  neu();
  return angelegt;
}

export async function synchronisiereHbl(opt: HblSyncOptionen): Promise<SyncErgebnis> {
  const { db, hole, endpunkte, parser, wettbewerb, saison, jetzt = new Date(), mitTeams = false } = opt;
  const meta = HBL_WETTBEWERBE[wettbewerb];
  const abfrage = { wettbewerb, saison };
  let anfragen = 0;
  let neu = 0;
  let aktualisiert = 0;
  const meldungen: string[] = [];
  const warn = (t: string) => meldungen.push(t);
  // Jede Seite höchstens einmal je Lauf holen (Tabelle und Spielplan werten sie ggf. mehrfach aus).
  const seiten = new Map<string, string>();
  const zaehlendHole: HoleHbl = async (pfad) => {
    const bekannt = seiten.get(pfad);
    if (bekannt !== undefined) return bekannt;
    anfragen++;
    const html = await hole(pfad);
    seiten.set(pfad, html);
    return html;
  };
  const ergebnis = (status: SyncErgebnis["status"]): SyncErgebnis => ({ status, anfragen, neu, aktualisiert, meldungen, unvollstaendig: false });
  const fehlertext = (err: unknown) => (err instanceof Error ? err.message : String(err));

  // 1. Tabelle zuerst: ihre Team-Links liefern die UUIDs aller Teams der Liga.
  let tabelle: HblTabellenzeile[] | null = null;
  let tabellenWarnungen: string[] = [];
  try {
    const t = await holeTabelle(zaehlendHole, endpunkte, parser, abfrage, []);
    tabelle = t.zeilen.length > 0 ? t.zeilen : null;
    tabellenWarnungen = t.warnungen;
  } catch (err) {
    warn(`HBL ${meta.kurz}: Tabelle nicht lesbar (${fehlertext(err)})`);
  }

  // 2. Teamübersicht (Logos, Kürzel, Namen für die Zuordnung): auf Wunsch, oder sobald Namen nicht zuordenbar waren.
  let teams: HblTeam[] = [];
  let problem = false;
  const refs = new Map<string, HblTeamRef>();
  const merkeRefs = () => {
    for (const t of teams) refs.set(t.externalId, { externalId: t.externalId, name: t.name });
    for (const z of tabelle ?? []) refs.set(z.teamId, { externalId: z.teamId, name: z.name });
  };
  let teamsGeladen = false;
  const ladeTeams = async () => {
    if (teamsGeladen) return;
    teamsGeladen = true;
    try {
      teams = await holeTeams(zaehlendHole, endpunkte, parser, abfrage);
    } catch (err) {
      problem = true;
      warn(`HBL ${meta.kurz}: Teamübersicht nicht lesbar (${fehlertext(err)})`);
    }
    merkeRefs();
  };
  if (mitTeams || tabellenWarnungen.length > 0 || !tabelle) await ladeTeams();
  merkeRefs();

  // Tabelle mit allen bekannten Teams erneut zuordnen, wenn vorher etwas fehlte.
  if (tabellenWarnungen.length > 0 || !tabelle) {
    try {
      const t = await holeTabelle(zaehlendHole, endpunkte, parser, abfrage, [...refs.values()]);
      tabelle = t.zeilen.length > 0 ? t.zeilen : null;
      for (const w of t.warnungen) warn(`HBL ${meta.kurz}: ${w}`);
    } catch {
      // schon oben gemeldet
    }
    merkeRefs();
  }
  if (!tabelle) problem = true;

  // 3. Spielplan; bei nicht zuordenbaren Teams einmal mit der Teamübersicht wiederholen.
  let spiele: HblSpiel[] = [];
  let spielplanWarnungen: string[] = [];
  let spielplanFehler: string | null = null;
  const leseSpielplan = async () => {
    try {
      const r = await holeSpielplan(zaehlendHole, endpunkte, parser, abfrage, [...refs.values()]);
      spiele = r.spiele;
      spielplanWarnungen = r.warnungen;
      spielplanFehler = null;
    } catch (err) {
      spielplanFehler = fehlertext(err);
    }
  };
  await leseSpielplan();
  if ((spielplanFehler || spielplanWarnungen.length > 0) && !teamsGeladen) {
    await ladeTeams();
    await leseSpielplan();
  }
  if (spielplanFehler) {
    problem = true;
    warn(`HBL ${meta.kurz}: Spielplan nicht lesbar (${spielplanFehler})`);
    if (!tabelle) return ergebnis("fehler");
  }
  for (const w of spielplanWarnungen.slice(0, 5)) warn(`HBL ${meta.kurz}: ${w}`);
  if (spielplanWarnungen.length > 5) warn(`HBL ${meta.kurz}: … und ${spielplanWarnungen.length - 5} weitere Spiele nicht lesbar`);
  if (spielplanWarnungen.length > 0) problem = true;
  if (!tabelle && spiele.length === 0) {
    warn(`HBL ${meta.kurz}: weder Tabelle noch Spielplan gelesen — nichts geändert`);
    return ergebnis("fehler");
  }

  // Gruppe (je Wettbewerb und Saison)
  const gruppenWerte = { quelle: HBL_QUELLE, championship: meta.name, saison, ligaName: meta.name, geschlecht: "m", altersklasse: null, spielklasse: meta.kurz, gruppe: null, istMeldeliste: false };
  const gruppenId = `${wettbewerb}:${saison}`;
  let gruppe = await db.query.ligaGruppen.findFirst({ where: and(eq(ligaGruppen.verband, HBL_VERBAND), eq(ligaGruppen.nuligaGroupId, gruppenId)) });
  if (gruppe) {
    await db.update(ligaGruppen).set(gruppenWerte).where(eq(ligaGruppen.id, gruppe.id));
  } else {
    [gruppe] = await db.insert(ligaGruppen).values({ verband: HBL_VERBAND, nuligaGroupId: gruppenId, ...gruppenWerte }).returning();
    neu++;
  }
  const gruppeId = gruppe.id;

  // Tabelle (alle Teams der Liga)
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

  // Zuordnung Team -> bestehender Verein (nur diese bekommen Mannschaft, Teilnahme und Spiele)
  const identitaeten = await db.query.ligaExterneIdentitaeten.findMany({ where: eq(ligaExterneIdentitaeten.quelle, HBL_QUELLE) });
  const vereinJeTeam = new Map(identitaeten.map((i) => [i.externeId, i.ligaVereinId]));
  const teamJeId = new Map(teams.map((t) => [t.externalId, t]));
  const ohneVerein = [...refs.values()].filter((t) => !vereinJeTeam.has(t.externalId));
  if (ohneVerein.length > 0) warn(`HBL ${meta.kurz}: ${ohneVerein.length} Team(s) keinem Verein zugeordnet (kein neuer Verein angelegt)`);

  const zugeordnet = [...vereinJeTeam.keys()].filter((id) => teamJeId.has(id) || spiele.some((s) => s.home.externalId === id || s.away.externalId === id));
  for (const teamId of zugeordnet) {
    const ligaVereinId = vereinJeTeam.get(teamId)!;
    const team = teamJeId.get(teamId);
    const zeile = tabelle?.find((z) => z.teamId === teamId);
    const name = team?.name ?? zeile?.name ?? spiele.map((s) => (s.home.externalId === teamId ? s.home.name : s.away.externalId === teamId ? s.away.name : null)).find(Boolean) ?? teamId;
    try {
      if (team) {
        await db
          .update(ligaExterneIdentitaeten)
          .set({ externerCode: team.code, name: team.name, logoUrl: team.logoUrl, aktualisiertAm: new Date() })
          .where(and(eq(ligaExterneIdentitaeten.quelle, HBL_QUELLE), eq(ligaExterneIdentitaeten.externeId, teamId)));
      }
      const mannschaft = await sorgeFuerMannschaft(db, ligaVereinId, saison, () => neu++, warn);
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
      warn(`Team ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Spiele der zugeordneten Teams (Schlüssel: Gruppe + Spiel-UUID als spielcode)
  const meine = new Set(zugeordnet);
  const eigene = spiele.filter((s) => meine.has(s.home.externalId) || meine.has(s.away.externalId));
  if (eigene.length === 0) {
    if (zugeordnet.length > 0) warn(`HBL ${meta.kurz}: keine Spiele der zugeordneten Teams gefunden`);
    return ergebnis(problem || meldungen.some((m) => m.startsWith("Team ")) ? "teilweise" : "erfolgreich");
  }
  const codes = eigene.map((s) => s.externalMatchId);
  const bestehende = await db.query.ligaSpiele.findMany({ where: and(eq(ligaSpiele.gruppeId, gruppeId), inArray(ligaSpiele.spielcode, codes)) });
  const nachCode = new Map(bestehende.map((b) => [b.spielcode, b]));
  const zuSchreiben: (typeof ligaSpiele.$inferInsert)[] = [];
  for (const s of eigene) {
    const felder = hblSpielFelder(s);
    const alt = nachCode.get(s.externalMatchId);
    if (alt && !spielGeaendert({ ...alt } as SpielFelder, felder)) continue;
    zuSchreiben.push({ gruppeId, spielcode: s.externalMatchId, quelle: HBL_QUELLE, externeId: s.externalMatchId, ...felder });
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
  // Künftige Spiele der zugeordneten Teams, die die HBL nicht mehr führt, entfernen.
  await db.delete(ligaSpiele).where(
    and(
      eq(ligaSpiele.gruppeId, gruppeId),
      eq(ligaSpiele.quelle, HBL_QUELLE),
      gte(ligaSpiele.datum, tagKey(jetzt)),
      notInArray(ligaSpiele.spielcode, codes),
      or(inArray(ligaSpiele.heimTeamtableId, [...meine]), inArray(ligaSpiele.gastTeamtableId, [...meine]))
    )
  );
  return ergebnis(problem || meldungen.some((m) => m.startsWith("Team ")) ? "teilweise" : "erfolgreich");
}
