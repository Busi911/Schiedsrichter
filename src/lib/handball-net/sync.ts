import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import {
  ligaGruppen,
  ligaMannschaften,
  ligaSpiele,
  ligaSyncLaeufe,
  ligaTabellenzeilen,
  ligaTeilnahmen,
  ligaVereine,
} from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import { saisonLabel as saisonLabelFuerDatum } from "@/lib/saison";
import type { LigaDb, SyncErgebnis } from "@/lib/nuliga/sync";
import { spielGeaendert, type SpielFelder } from "@/lib/nuliga/sync-hilfen";
import type { HoleJson } from "./client";
import {
  berechneTabelle,
  parseOffizielleTabelle,
  normalisiereHnetTeam,
  parsePhasen,
  parseSaisons,
  parseSpiele,
  parseTeam,
  schoenerTeamname,
  teamUebernehmen,
  type HnetPhase,
  type HnetSaison,
  type HnetSpiel,
  type HnetTeam,
} from "./modell";

// Synchronisation handball.net -> Handballerpate-DB (zweite Datenquelle neben
// nuLiga, siehe lib/nuliga/sync.ts). Gleiche Prinzipien: idempotent, nur
// geänderte Zeilen werden geschrieben, fehlertolerant (eine fehlgeschlagene
// Mannschaft/Phase bricht den Lauf nicht ab, bei leerer Antwort wird nichts
// gelöscht) und unabhängig von nuLiga (ein Ausfall einer Quelle betrifft die
// andere nicht). Einstieg ist die handball.net-Vereins-ID; optional manuell
// hinterlegte Team-IDs ergänzen die Teamliste.

export type HandballNetSyncOptionen = {
  db: LigaDb;
  holeJson: HoleJson;
  jetzt?: Date;
  frist?: number;
};

const VERBAND = "DHB";
const QUELLE = "handball_net";
const FRISCH_MS = 30 * 60 * 1000;
const SEITENGROESSE = 100;
const MAX_SEITEN = 15;

type Roh = Record<string, unknown>;
const alsObj = (x: unknown): Roh | null =>
  typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Roh) : null;

// Seitenweise Abruf einer paginierten Liste ({ data: [...], pagination }).
async function holeAlleSeiten(holeJson: HoleJson, pfad: string): Promise<unknown[]> {
  const alle: unknown[] = [];
  let letzte = 1;
  for (let seite = 1; seite <= Math.min(letzte, MAX_SEITEN); seite++) {
    const antwort = alsObj(
      await holeJson(`${pfad}${pfad.includes("?") ? "&" : "?"}per_page=${SEITENGROESSE}&page=${seite}`)
    );
    if (!antwort || !Array.isArray(antwort.data)) {
      throw new Error("Unerwartetes Antwortformat (kein data-Array)");
    }
    alle.push(...antwort.data);
    const l = Number(alsObj(antwort.pagination)?.last_page);
    if (Number.isInteger(l) && l > letzte) letzte = l;
  }
  return alle;
}

function datenArray(antwort: unknown): unknown[] {
  if (Array.isArray(antwort)) return antwort;
  const d = alsObj(antwort)?.data;
  return Array.isArray(d) ? d : [];
}

// Teams eines Vereins über die Vereins-ID. Der Endpunkt der Teamliste ist
// nicht dokumentiert, deshalb werden mehrere plausible Pfade nacheinander
// probiert (der erste mit Treffern gewinnt); die Meldung nennt, welcher
// funktioniert hat bzw. woran es scheiterte. Manuell hinterlegte Team-IDs
// gelten immer zusätzlich.
async function ermittleTeamIds(
  holeJson: HoleJson,
  clubId: string | null,
  manuell: string[],
  saisonId: string | null,
  meldung: (t: string) => void
): Promise<string[]> {
  const ids = new Set(manuell);
  if (clubId) {
    const season = saisonId ? `season_id=${encodeURIComponent(saisonId)}` : "";
    const kandidaten = [
      `/api/new/teams?club_id=${encodeURIComponent(clubId)}${season ? `&${season}` : ""}`,
      `/api/new/teams/clubs/${encodeURIComponent(clubId)}/teams${season ? `?${season}` : ""}`,
      `/api/new/clubs/${encodeURIComponent(clubId)}/teams${season ? `?${season}` : ""}`,
    ];
    const fehler: string[] = [];
    let gefunden = false;
    for (const pfad of kandidaten) {
      try {
        // seitenweise (die API liefert standardmäßig nur 25 Teams)
        const liste = await holeAlleSeiten(holeJson, pfad);
        const treffer = liste
          .map(parseTeam)
          .filter((t): t is HnetTeam => t !== null && (t.clubId === null || t.clubId === clubId));
        if (treffer.length > 0) {
          treffer.forEach((t) => ids.add(t.id));
          gefunden = true;
          break;
        }
        fehler.push(`${pfad.split("?")[0]}: leer`);
      } catch (err) {
        fehler.push(`${pfad.split("?")[0]}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!gefunden && manuell.length === 0) {
      meldung(
        `handball.net: Teamliste zu Verein ${clubId} nicht abrufbar (${fehler.join("; ")}) – ` +
          `bitte Team-IDs manuell hinterlegen`
      );
    }
  }
  return [...ids];
}

function waehleSaison(saisons: HnetSaison[], jetzt: Date): HnetSaison | null {
  if (saisons.length === 0) return null;
  const heute = tagKey(jetzt);
  return (
    saisons.find((s) => s.start <= heute && heute <= s.ende) ??
    [...saisons].sort((a, b) => a.start.localeCompare(b.start)).at(-1)!
  );
}

function spielFelder(s: HnetSpiel, teamId: string): SpielFelder {
  void teamId;
  return {
    datum: s.datum,
    uhrzeit: s.uhrzeit,
    beginn: s.beginn,
    urspruenglicherBeginn: null,
    halleName: s.halle?.name ?? null,
    halleNummer: null,
    halleNuligaId: s.halle?.id ?? null,
    heimName: schoenerTeamname(s.heim.name, s.heim.clubName),
    gastName: schoenerTeamname(s.gast.name, s.gast.clubName),
    heimTeamtableId: s.heim.id,
    gastTeamtableId: s.gast.id,
    meetingId: null,
    toreHeim: s.toreHeim,
    toreGast: s.toreGast,
    halbzeitHeim: null,
    halbzeitGast: null,
    ergebnisBestaetigt: s.beendet,
    status: s.status,
  };
}

export async function synchronisiereHandballNet(
  ligaVereinId: string,
  { db, holeJson, jetzt = new Date(), frist }: HandballNetSyncOptionen
): Promise<SyncErgebnis> {
  const start = Date.now();
  let anfragen = 0;
  let neu = 0;
  let aktualisiert = 0;
  let hatFehler = false;
  let unvollstaendig = false;
  const meldungen: string[] = [];
  const warn = (t: string) => meldungen.push(t);
  const fehler = (t: string) => {
    hatFehler = true;
    meldungen.push(t);
  };
  const hole: HoleJson = async (pfad) => {
    anfragen++;
    return holeJson(pfad);
  };
  const fristAbgelaufen = () => {
    if (frist !== undefined && Date.now() > frist) {
      if (!unvollstaendig) warn("handball.net: Zeitlimit erreicht – Rest wird beim nächsten Lauf geladen");
      unvollstaendig = true;
      return true;
    }
    return false;
  };

  const verein = await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.id, ligaVereinId) });
  if (!verein) throw new Error("Liga-Verein nicht gefunden");

  const protokoll = async (fatal: boolean): Promise<SyncErgebnis> => {
    const status: SyncErgebnis["status"] = fatal ? "fehler" : hatFehler || unvollstaendig ? "teilweise" : "erfolgreich";
    await db.insert(ligaSyncLaeufe).values({
      ligaVereinId,
      art: "handball_net",
      dauerMs: Date.now() - start,
      anfragen,
      neu,
      aktualisiert,
      status,
      meldungen: meldungen.slice(0, 50),
    });
    if (!unvollstaendig) {
      await db
        .update(ligaVereine)
        .set({ handballNetSynchronisiertAm: new Date() })
        .where(eq(ligaVereine.id, ligaVereinId));
    }
    return { status, anfragen, neu, aktualisiert, meldungen, unvollstaendig };
  };

  const manuell = (verein.handballNetTeamIds ?? "")
    .split(/[\s,;]+/)
    .filter((x) => /^\d+$/.test(x));
  if (!verein.handballNetClubId && manuell.length === 0) {
    fehler("handball.net: weder Vereins-ID noch Team-IDs hinterlegt");
    return protokoll(true);
  }

  // Saison (Datumsfenster der Spielabfragen und Saison-Label)
  let saison: HnetSaison | null = null;
  try {
    saison = waehleSaison(parseSaisons(alsObj(await hole("/api/new/seasons"))?.data), jetzt);
  } catch (err) {
    warn(`handball.net: Saisonliste: ${err instanceof Error ? err.message : String(err)}`);
  }
  const label = saison?.label ?? saisonLabelFuerDatum(jetzt);
  const von = saison?.start ?? `${jetzt.getMonth() >= 6 ? jetzt.getFullYear() : jetzt.getFullYear() - 1}-07-01`;
  const bis = saison?.ende ?? `${Number(von.slice(0, 4)) + 1}-06-30`;

  const teamIds = await ermittleTeamIds(hole, verein.handballNetClubId, manuell, saison?.id ?? null, (t) =>
    fehler(t)
  );
  if (teamIds.length === 0) return protokoll(true);

  // Bestehende Teilnahmen (Frische/Reihenfolge)
  const bekannte = await db
    .select({ t: ligaTeilnahmen })
    .from(ligaTeilnahmen)
    .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
    .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
    .where(and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaGruppen.quelle, QUELLE)));
  const letzterSync = (teamId: string) => {
    const zeiten = bekannte
      .filter((b) => b.t.nuligaTeamtableId === teamId)
      .map((b) => b.t.spieleSynchronisiertAm?.getTime() ?? 0);
    return zeiten.length ? Math.min(...zeiten) : 0;
  };
  teamIds.sort((a, b) => letzterSync(a) - letzterSync(b));

  const tabellenDieserLauf = new Set<string>(); // Phasen, deren Tabelle schon geladen wurde
  const gesehen: string[] = [];
  const gesehenTeams = new Set<string>();
  let ohneWettbewerb = 0;

  for (const teamId of teamIds) {
    gesehenTeams.add(teamId);
    if (jetzt.getTime() - letzterSync(teamId) < FRISCH_MS && letzterSync(teamId) > 0) {
      for (const b of bekannte) if (b.t.nuligaTeamtableId === teamId) gesehen.push(b.t.id);
      continue;
    }
    if (fristAbgelaufen()) break;
    try {
      const team = parseTeam(alsObj(await hole(`/api/new/teams/${encodeURIComponent(teamId)}`))?.data);
      if (!team) throw new Error("Team nicht lesbar");
      if (!teamUebernehmen(team.clubId, verein.handballNetClubId, manuell, teamId)) {
        warn(`Team ${teamId} (${team.name}) gehört zu Verein ${team.clubId}, übersprungen`);
        continue;
      }
      const wettbewerbe = parsePhasen(
        datenArray(
          await hole(
            `/api/new/teams/${encodeURIComponent(teamId)}/competitions` +
              (saison ? `?season_id=${encodeURIComponent(saison.id)}` : "")
          )
        )
      );
      if (wettbewerbe.length === 0) {
        // Z.B. Mannschaften, die nur in nuLiga (Landesverband) spielen, aber
        // bei handball.net geführt werden — kein Fehler, nur eine Sammelmeldung.
        ohneWettbewerb++;
        continue;
      }

      const norm = normalisiereHnetTeam(team);
      const mannschaft = await sorgeFuerMannschaft(db, ligaVereinId, team, norm, label, () => neu++, warn);

      for (const phase of wettbewerbe) {
        if (fristAbgelaufen()) break;
        const ergebnis = await verarbeitePhase({
          db,
          hole,
          verein: { id: ligaVereinId },
          team,
          mannschaftId: mannschaft.id,
          phase,
          label,
          von,
          bis,
          jetzt,
          tabellenDieserLauf,
          zaehler: {
            neu: () => neu++,
            aktualisiert: () => aktualisiert++,
          },
          warn,
        });
        if (ergebnis) gesehen.push(ergebnis);
      }
    } catch (err) {
      fehler(`Team ${teamId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (ohneWettbewerb > 0) {
    warn(`handball.net: ${ohneWettbewerb} Mannschaft(en) ohne DHB-Wettbewerb in Saison ${label} übersprungen (spielen im Landesverband)`);
  }

  // Teilnahmen von Teams, die nicht mehr aufgeführt sind, deaktivieren (nie
  // löschen). Nur bei vollständigem Lauf mit erfolgreicher Teamliste.
  if (!unvollstaendig && !hatFehler && verein.handballNetClubId) {
    const veraltet = bekannte.filter(
      (b) => b.t.nuligaTeamtableId && !gesehenTeams.has(b.t.nuligaTeamtableId) && b.t.aktiv
    );
    if (veraltet.length > 0) {
      await db
        .update(ligaTeilnahmen)
        .set({ aktiv: false })
        .where(inArray(ligaTeilnahmen.id, veraltet.map((b) => b.t.id)));
      await aktualisiereMannschaftAktiv(db, ligaVereinId);
    }
  }

  return protokoll(false);
}

type Norm = ReturnType<typeof normalisiereHnetTeam>;

// Mannschaft des Vereins zum Team finden/anlegen. Gleicher Schlüssel =
// dieselbe Mannschaft. Hat die Mannschaft mit diesem Schlüssel aber bereits
// eine aktive nuLiga-Teilnahme in derselben Saison, ist das mit hoher
// Wahrscheinlichkeit eine ANDERE Mannschaft desselben Vereins (z.B. zweite
// Mannschaft in der 3. Liga neben einer Bezirksliga-Mannschaft gleichen
// Namens): sie wird getrennt geführt und gemeldet, nicht still vermischt.
async function sorgeFuerMannschaft(
  db: LigaDb,
  ligaVereinId: string,
  team: HnetTeam,
  norm: Norm,
  saison: string,
  neuZaehlen: () => void,
  warn: (t: string) => void
) {
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
          eq(ligaGruppen.quelle, "nuliga")
        )
      )
      .limit(1);
    if (fremd.length > 0) {
      warn(
        `"${team.name}" (handball.net) kollidiert mit Mannschaft "${mit.name}" aus nuLiga – getrennt geführt (DHB)`
      );
      schluessel = `${schluessel}:dhb`;
      slugBasis = `${slugBasis}-dhb`;
      name = `${name} (DHB)`;
    }
  }
  const stammdaten = {
    name,
    kategorie: norm.kategorie,
    geschlecht: norm.geschlecht,
    altersklasse: norm.altersklasse,
    untergruppe: norm.untergruppe,
    nummer: norm.nummer,
    aktiv: true,
  };
  const vorhanden =
    schluessel === norm.schluessel
      ? mit
      : await db.query.ligaMannschaften.findFirst({
          where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.schluessel, schluessel)),
        });
  if (vorhanden) {
    await db.update(ligaMannschaften).set(stammdaten).where(eq(ligaMannschaften.id, vorhanden.id));
    return vorhanden;
  }
  let slug = slugBasis;
  for (
    let i = 2;
    await db.query.ligaMannschaften.findFirst({
      where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.slug, slug)),
    });
    i++
  ) {
    slug = `${slugBasis}-${i}`;
  }
  const [angelegt] = await db
    .insert(ligaMannschaften)
    .values({ ligaVereinId, slug, schluessel, ...stammdaten })
    .returning();
  neuZaehlen();
  return angelegt;
}

async function aktualisiereMannschaftAktiv(db: LigaDb, ligaVereinId: string) {
  const alle = await db.query.ligaMannschaften.findMany({
    where: eq(ligaMannschaften.ligaVereinId, ligaVereinId),
    columns: { id: true },
  });
  const ids = alle.map((m) => m.id);
  if (ids.length === 0) return;
  const aktive = await db
    .selectDistinct({ id: ligaTeilnahmen.mannschaftId })
    .from(ligaTeilnahmen)
    .where(and(inArray(ligaTeilnahmen.mannschaftId, ids), eq(ligaTeilnahmen.aktiv, true)));
  const aktivIds = aktive.map((a) => a.id);
  await db
    .update(ligaMannschaften)
    .set({ aktiv: false })
    .where(
      and(
        eq(ligaMannschaften.ligaVereinId, ligaVereinId),
        aktivIds.length > 0 ? notInArray(ligaMannschaften.id, aktivIds) : sql`true`
      )
    );
}

type PhaseKontext = {
  db: LigaDb;
  hole: HoleJson;
  verein: { id: string };
  team: HnetTeam;
  mannschaftId: string;
  phase: HnetPhase;
  label: string;
  von: string;
  bis: string;
  jetzt: Date;
  tabellenDieserLauf: Set<string>;
  zaehler: { neu: () => void; aktualisiert: () => void };
  warn: (t: string) => void;
};

// Eine Phase (Wettbewerb/Staffel) eines Teams: Gruppe, Teilnahme, Spiele,
// Tabelle. Gibt die ID der Teilnahme zurück.
async function verarbeitePhase(k: PhaseKontext): Promise<string | null> {
  const { db, hole, team, phase, label, von, bis, jetzt, warn } = k;
  const ligaName = phase.name ? `${phase.competitionName} - ${phase.name}` : phase.competitionName;
  const gruppenWerte = {
    quelle: QUELLE,
    championship: phase.competitionName,
    saison: label,
    ligaName,
    geschlecht: team.gender,
    altersklasse: normalisiereHnetTeam(team).altersklasse,
    spielklasse: phase.competitionName,
    gruppe: phase.name || null,
    istMeldeliste: false,
  };
  let gruppe = await db.query.ligaGruppen.findFirst({
    where: and(eq(ligaGruppen.verband, VERBAND), eq(ligaGruppen.nuligaGroupId, phase.id)),
  });
  if (gruppe) {
    await db.update(ligaGruppen).set(gruppenWerte).where(eq(ligaGruppen.id, gruppe.id));
  } else {
    [gruppe] = await db
      .insert(ligaGruppen)
      .values({ verband: VERBAND, nuligaGroupId: phase.id, ...gruppenWerte })
      .returning();
    k.zaehler.neu();
  }

  // Spiele des Teams in der Phase
  const spielPfad =
    `/api/new/matches?team_id=${encodeURIComponent(team.id)}&phase_id=${encodeURIComponent(phase.id)}` +
    `&date_from=${von}&date_to=${bis}`;
  const spiele = parseSpiele(await holeAlleSeiten(hole, spielPfad)).filter(
    (s) => s.heim.id === team.id || s.gast.id === team.id
  );

  // Tabelle der Phase aus allen Spielen der Phase (einmal je Lauf und Phase)
  let tabelle = null as ReturnType<typeof berechneTabelle> | null;
  const tabelleFrisch =
    gruppe.tabelleSynchronisiertAm !== null &&
    jetzt.getTime() - gruppe.tabelleSynchronisiertAm.getTime() < FRISCH_MS;
  if (phase.hatTabelle && !k.tabellenDieserLauf.has(phase.id) && !tabelleFrisch) {
    k.tabellenDieserLauf.add(phase.id);
    try {
      // Erst die offizielle Tabelle (inkl. direktem Vergleich), sonst berechnen.
      try {
        tabelle = parseOffizielleTabelle(
          await hole(`/api/new/standings?phase_id=${encodeURIComponent(phase.id)}`)
        );
      } catch {
        tabelle = null;
      }
      if (!tabelle) {
        const alle = parseSpiele(
          await holeAlleSeiten(hole, `/api/new/matches?phase_id=${encodeURIComponent(phase.id)}&date_from=${von}&date_to=${bis}`)
        );
        if (alle.length === 0) {
          warn(`${ligaName}: keine Phasenspiele für die Tabelle gefunden`);
        } else {
          tabelle = berechneTabelle(alle);
          warn(`${ligaName}: Tabelle aus Spielergebnissen berechnet (ohne direkten Vergleich)`);
        }
      }
    } catch (err) {
      warn(`${ligaName}: Tabelle nicht berechenbar (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  if (tabelle && tabelle.length > 0) {
    for (const z of tabelle) {
      const werte = {
        name: z.name,
        rang: z.rang,
        spiele: z.spiele,
        siege: z.siege,
        unentschieden: z.unentschieden,
        niederlagen: z.niederlagen,
        torePlus: z.torePlus,
        toreMinus: z.toreMinus,
        punktePlus: z.punktePlus,
        punkteMinus: z.punkteMinus,
      };
      await db
        .insert(ligaTabellenzeilen)
        .values({ gruppeId: gruppe.id, nuligaTeamtableId: z.teamId, ...werte })
        .onConflictDoUpdate({
          target: [ligaTabellenzeilen.gruppeId, ligaTabellenzeilen.nuligaTeamtableId],
          set: werte,
        });
    }
    await db.delete(ligaTabellenzeilen).where(
      and(
        eq(ligaTabellenzeilen.gruppeId, gruppe.id),
        notInArray(ligaTabellenzeilen.nuligaTeamtableId, tabelle.map((z) => z.teamId))
      )
    );
    await db.update(ligaGruppen).set({ tabelleSynchronisiertAm: new Date() }).where(eq(ligaGruppen.id, gruppe.id));
  }
  const eigeneZeile = tabelle?.find((z) => z.teamId === team.id);

  // Teilnahme
  const vorher = await db.query.ligaTeilnahmen.findFirst({
    where: and(eq(ligaTeilnahmen.mannschaftId, k.mannschaftId), eq(ligaTeilnahmen.gruppeId, gruppe.id)),
  });
  const teilnahmeWerte = {
    saison: label,
    nuligaTeamtableId: team.id,
    nuligaName: team.name,
    rang: eigeneZeile?.rang ?? vorher?.rang ?? null,
    punktePlus: eigeneZeile?.punktePlus ?? vorher?.punktePlus ?? null,
    punkteMinus: eigeneZeile?.punkteMinus ?? vorher?.punkteMinus ?? null,
    aktiv: true,
    synchronisiertAm: new Date(),
  };
  let teilnahmeId: string;
  if (vorher) {
    await db.update(ligaTeilnahmen).set(teilnahmeWerte).where(eq(ligaTeilnahmen.id, vorher.id));
    teilnahmeId = vorher.id;
  } else {
    const [angelegt] = await db
      .insert(ligaTeilnahmen)
      .values({ mannschaftId: k.mannschaftId, gruppeId: gruppe.id, ...teilnahmeWerte })
      .returning({ id: ligaTeilnahmen.id });
    teilnahmeId = angelegt.id;
    k.zaehler.neu();
  }

  if (spiele.length === 0) {
    warn(`${team.name} (${ligaName}): Spielplan enthält keine Spiele`);
    return teilnahmeId;
  }

  // Spiele upserten (Schlüssel: Gruppe + offizielle Spielnummer, sonst API-ID)
  const mitCode = spiele.map((s) => ({ s, code: s.code ?? `id:${s.id}` }));
  const codes = mitCode.map((x) => x.code);
  const bestehende = await db.query.ligaSpiele.findMany({
    where: and(eq(ligaSpiele.gruppeId, gruppe.id), inArray(ligaSpiele.spielcode, codes)),
  });
  const nachCode = new Map(bestehende.map((b) => [b.spielcode, b]));
  for (const { s, code } of mitCode) {
    const felder = spielFelder(s, team.id);
    const alt = nachCode.get(code);
    if (alt && !spielGeaendert({ ...alt } as SpielFelder, felder)) continue;
    await db
      .insert(ligaSpiele)
      .values({ gruppeId: gruppe.id, spielcode: code, quelle: QUELLE, externeId: s.id, ...felder })
      .onConflictDoUpdate({
        target: [ligaSpiele.gruppeId, ligaSpiele.spielcode],
        set: { ...felder, externeId: s.id, synchronisiertAm: new Date() },
      });
    if (alt) k.zaehler.aktualisiert();
    else k.zaehler.neu();
  }

  // Zukünftige Spiele des Teams, die handball.net nicht mehr führt, entfernen.
  await db.delete(ligaSpiele).where(
    and(
      eq(ligaSpiele.gruppeId, gruppe.id),
      eq(ligaSpiele.quelle, QUELLE),
      gte(ligaSpiele.datum, tagKey(jetzt)),
      notInArray(ligaSpiele.spielcode, codes),
      sql`(${ligaSpiele.heimTeamtableId} = ${team.id} or ${ligaSpiele.gastTeamtableId} = ${team.id})`
    )
  );
  await db.update(ligaTeilnahmen).set({ spieleSynchronisiertAm: new Date() }).where(eq(ligaTeilnahmen.id, teilnahmeId));
  return teilnahmeId;
}
