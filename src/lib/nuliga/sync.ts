import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
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
import { parseClubTeams } from "./parsers/club-teams";
import { parseGroupPage } from "./parsers/group-page";
import { parseTeamPortrait } from "./parsers/team-portrait";
import { normalisiereMannschaft, parseLigaName, slugify } from "./normalisierung";
import { baueNuligaUrl } from "./verbaende";
import {
  baueNamensIndex,
  eigenerNameImPortrait,
  ergebnisGeaendert,
  ermittleTeamtable,
  spielGeaendert,
  spielZuFeldern,
  waehleSaison,
  type SpielFelder,
} from "./sync-hilfen";
import type { TabellenZeile } from "./types";

// Synchronisation nuLiga -> Handballerpate-DB. Idempotent (Upserts auf den
// nuLiga-Schlüsseln, nur geänderte Zeilen werden geschrieben) und
// fehlertolerant (ein fehlgeschlagener Abruf/eine Gruppe bricht den Lauf
// nicht ab; bei unlesbarer Seite werden KEINE Daten gelöscht).
// DB und HTTP sind injiziert (Tests: lokales Postgres + Fixture-HTML).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LigaDb = PgDatabase<any, typeof schema>;
export type HoleHtml = (url: string) => Promise<string>;

export type SyncOptionen = {
  db: LigaDb;
  holeHtml: HoleHtml;
  jetzt?: Date;
  // Absolute Frist (Date.now()-Millisekunden): danach werden keine neuen
  // nuLiga-Seiten mehr geladen, der Lauf endet ordentlich als "teilweise"
  // und setzt beim nächsten Aufruf fort — statt vom Serverless-Zeitlimit
  // hart abgebrochen zu werden (siehe maxDuration der aufrufenden Route).
  frist?: number;
};

// Gruppentabellen/Spielpläne, die jünger sind, werden bei einem
// Folgeaufruf nicht erneut geladen — so setzt ein zweiter Klick auf
// "Jetzt aktualisieren" nach einem Zeitlimit genau dort fort.
const FRISCH_MS = 30 * 60 * 1000;
export type SyncErgebnis = {
  status: "erfolgreich" | "teilweise" | "fehler";
  anfragen: number;
  neu: number;
  aktualisiert: number;
  meldungen: string[];
  // true, wenn der Lauf wegen der Frist (Zeitlimit) Teile NICHT geladen hat —
  // ein weiterer Aufruf setzt fort (Gegenstück zu "teilweise" wegen Fehlern).
  unvollstaendig: boolean;
};

class Lauf {
  anfragen = 0;
  neu = 0;
  aktualisiert = 0;
  meldungen: string[] = [];
  hatFehler = false;
  unvollstaendig = false;
  constructor(
    private holeHtml: HoleHtml,
    private frist?: number
  ) {}
  fristAbgelaufen(): boolean {
    if (this.frist !== undefined && Date.now() > this.frist) {
      if (!this.unvollstaendig) {
        this.meldungen.push("Zeitlimit erreicht – Rest wird beim nächsten Lauf geladen");
      }
      this.unvollstaendig = true;
      return true;
    }
    return false;
  }
  async hole(url: string): Promise<string> {
    this.anfragen++;
    return this.holeHtml(url);
  }
  warn(text: string) {
    this.meldungen.push(text);
  }
  fehler(text: string) {
    this.hatFehler = true;
    this.meldungen.push(text);
  }
}

async function protokolliere(
  db: LigaDb,
  ligaVereinId: string,
  art: "struktur" | "spiele",
  start: number,
  lauf: Lauf,
  fatal: boolean
): Promise<SyncErgebnis> {
  const status: SyncErgebnis["status"] = fatal
    ? "fehler"
    : lauf.hatFehler || lauf.unvollstaendig
      ? "teilweise"
      : "erfolgreich";
  await db.insert(ligaSyncLaeufe).values({
    ligaVereinId,
    art,
    dauerMs: Date.now() - start,
    anfragen: lauf.anfragen,
    neu: lauf.neu,
    aktualisiert: lauf.aktualisiert,
    status,
    meldungen: lauf.meldungen.slice(0, 50),
  });
  // Alte Protokolle begrenzen.
  await db
    .delete(ligaSyncLaeufe)
    .where(
      and(
        eq(ligaSyncLaeufe.ligaVereinId, ligaVereinId),
        sql`${ligaSyncLaeufe.gestartetAm} < now() - interval '30 days'`
      )
    );
  // Bei unvollständigem Lauf (Zeitlimit) den Zeitstempel NICHT setzen: der
  // Verein bleibt "fällig", der nächste Aufruf (Cron oder "Jetzt
  // aktualisieren") macht weiter.
  const stempel =
    art === "struktur"
      ? { strukturSynchronisiertAm: lauf.unvollstaendig ? undefined : new Date(), syncStatus: status }
      : { spieleSynchronisiertAm: lauf.unvollstaendig ? undefined : new Date(), syncStatus: status };
  await db.update(ligaVereine).set(stempel).where(eq(ligaVereine.id, ligaVereinId));
  return {
    status,
    anfragen: lauf.anfragen,
    neu: lauf.neu,
    aktualisiert: lauf.aktualisiert,
    meldungen: lauf.meldungen,
    unvollstaendig: lauf.unvollstaendig,
  };
}

// Legt die öffentliche Seite für einen registrierten Verein an (idempotent).
export async function legeLigaVereinAn(
  db: LigaDb,
  eingabe: { vereinId: string; nuligaClubId: string; name: string; verband?: string }
): Promise<{ id: string; slug: string }> {
  const bestehend = await db.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, eingabe.vereinId),
  });
  if (bestehend) {
    if (bestehend.nuligaClubId !== eingabe.nuligaClubId) {
      // Slug bleibt stabil (URLs sollen nicht brechen), nur die ID ändert sich.
      await db
        .update(ligaVereine)
        .set({ nuligaClubId: eingabe.nuligaClubId, strukturSynchronisiertAm: null })
        .where(eq(ligaVereine.id, bestehend.id));
    }
    return { id: bestehend.id, slug: bestehend.slug };
  }

  const basis = slugify(eingabe.name) || "verein";
  let slug = basis;
  for (let i = 2; await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.slug, slug) }); i++) {
    slug = `${basis}-${i}`;
  }
  const [neu] = await db
    .insert(ligaVereine)
    .values({
      vereinId: eingabe.vereinId,
      slug,
      name: eingabe.name,
      verband: eingabe.verband ?? "HHV",
      nuligaClubId: eingabe.nuligaClubId,
    })
    .returning({ id: ligaVereine.id });
  return { id: neu.id, slug };
}

type GruppeKopf = { championship: string; ligaName: string; saison: string | null };

async function upsertGruppe(
  db: LigaDb,
  verband: string,
  gruppenId: string,
  kopf: GruppeKopf,
  lauf: Lauf
): Promise<string> {
  const liga = parseLigaName(kopf.ligaName);
  const werte = {
    championship: kopf.championship,
    saison: kopf.saison,
    ligaName: liga.name,
    geschlecht: liga.geschlecht,
    altersklasse: liga.altersklasse,
    spielklasse: liga.spielklasse,
    gruppe: liga.gruppe,
    istMeldeliste: liga.istMeldeliste,
  };
  const vorher = await db.query.ligaGruppen.findFirst({
    where: and(eq(ligaGruppen.verband, verband), eq(ligaGruppen.nuligaGroupId, gruppenId)),
  });
  if (vorher) {
    await db.update(ligaGruppen).set(werte).where(eq(ligaGruppen.id, vorher.id));
    return vorher.id;
  }
  const [neu] = await db
    .insert(ligaGruppen)
    .values({ verband, nuligaGroupId: gruppenId, ...werte })
    .returning({ id: ligaGruppen.id });
  lauf.neu++;
  return neu.id;
}

// Lädt die groupPage und ersetzt die Tabellenzeilen der Gruppe. Gibt die
// aktuellen Zeilen zurück (bei Fehler: die bereits gespeicherten).
async function aktualisiereGruppentabelle(
  db: LigaDb,
  lauf: Lauf,
  verband: string,
  gruppeId: string,
  gruppenId: string,
  championship: string
): Promise<TabellenZeile[] | null> {
  try {
    const html = await lauf.hole(
      baueNuligaUrl(verband, "groupPage", { championship, group: gruppenId })
    );
    const { daten, warnungen } = parseGroupPage(html);
    for (const w of warnungen) lauf.warn(`Gruppe ${gruppenId}: ${w}`);
    const zeilen = daten.tabelle.filter((z) => z.teamtableId);
    if (zeilen.length === 0) {
      lauf.fehler(`Gruppe ${gruppenId}: keine Tabelle lesbar, bestehender Stand bleibt`);
      return null;
    }
    await db
      .update(ligaGruppen)
      .set({
        ...(daten.liga && {
          ligaName: daten.liga.name,
          geschlecht: daten.liga.geschlecht,
          altersklasse: daten.liga.altersklasse,
          spielklasse: daten.liga.spielklasse,
          gruppe: daten.liga.gruppe,
          istMeldeliste: daten.liga.istMeldeliste,
        }),
        tabelleSynchronisiertAm: new Date(),
      })
      .where(eq(ligaGruppen.id, gruppeId));
    for (const z of zeilen) {
      const werte = {
        name: z.mannschaft,
        rang: z.rang,
        spiele: z.spiele,
        siege: z.siege,
        unentschieden: z.unentschieden,
        niederlagen: z.niederlagen,
        torePlus: z.tore?.plus ?? null,
        toreMinus: z.tore?.minus ?? null,
        punktePlus: z.punkte?.plus ?? null,
        punkteMinus: z.punkte?.minus ?? null,
      };
      await db
        .insert(ligaTabellenzeilen)
        .values({ gruppeId, nuligaTeamtableId: z.teamtableId!, ...werte })
        .onConflictDoUpdate({
          target: [ligaTabellenzeilen.gruppeId, ligaTabellenzeilen.nuligaTeamtableId],
          set: werte,
        });
    }
    await db.delete(ligaTabellenzeilen).where(
      and(
        eq(ligaTabellenzeilen.gruppeId, gruppeId),
        notInArray(
          ligaTabellenzeilen.nuligaTeamtableId,
          zeilen.map((z) => z.teamtableId!)
        )
      )
    );
    return daten.tabelle;
  } catch (err) {
    lauf.fehler(`Gruppe ${gruppenId}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function gespeicherteTabelle(db: LigaDb, gruppeId: string): Promise<TabellenZeile[]> {
  const zeilen = await db.query.ligaTabellenzeilen.findMany({
    where: eq(ligaTabellenzeilen.gruppeId, gruppeId),
  });
  return zeilen.map((z) => ({
    rang: z.rang,
    mannschaft: z.name,
    teamtableId: z.nuligaTeamtableId,
    spiele: z.spiele,
    siege: z.siege,
    unentschieden: z.unentschieden,
    niederlagen: z.niederlagen,
    tore: z.torePlus === null ? null : { plus: z.torePlus, minus: z.toreMinus ?? 0 },
    punkte: z.punktePlus === null ? null : { plus: z.punktePlus, minus: z.punkteMinus ?? 0 },
  }));
}

export async function synchronisiereStruktur(
  ligaVereinId: string,
  { db, holeHtml, jetzt = new Date(), frist }: SyncOptionen
): Promise<SyncErgebnis> {
  const start = Date.now();
  const lauf = new Lauf(holeHtml, frist);
  const verein = await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.id, ligaVereinId) });
  if (!verein) throw new Error("Liga-Verein nicht gefunden");

  let club;
  try {
    const html = await lauf.hole(
      baueNuligaUrl(verein.verband, "clubTeams", { club: verein.nuligaClubId })
    );
    club = parseClubTeams(html);
  } catch (err) {
    lauf.fehler(`clubTeams: ${err instanceof Error ? err.message : String(err)}`);
    return protokolliere(db, ligaVereinId, "struktur", start, lauf, true);
  }
  for (const w of club.warnungen) lauf.warn(`clubTeams: ${w}`);

  const saison = waehleSaison(club.daten.teams, jetzt);
  if (!saison) {
    lauf.fehler("Keine reguläre Saison gefunden — bestehende Daten bleiben unverändert");
    return protokolliere(db, ligaVereinId, "struktur", start, lauf, true);
  }
  const vereinsname = club.daten.vereinsname ?? verein.name;
  if (vereinsname !== verein.name) {
    await db.update(ligaVereine).set({ name: vereinsname }).where(eq(ligaVereine.id, ligaVereinId));
  }

  const teams = club.daten.teams.filter((t) => t.regulaer && t.saison === saison);

  // Gruppen (je eine Abfrage pro Gruppe, Meldelisten nur aus clubTeams).
  const gruppen = new Map<string, { gruppeId: string; tabelle: TabellenZeile[] }>();
  for (const team of teams) {
    if (gruppen.has(team.gruppenId)) continue;
    if (normalisiereMannschaft(team.mannschaftsname).entfaellt) continue;
    const gruppeId = await upsertGruppe(
      db,
      verein.verband,
      team.gruppenId,
      { championship: team.championship, ligaName: team.ligaName, saison },
      lauf
    );
    let tabelle: TabellenZeile[] = [];
    if (!parseLigaName(team.ligaName).istMeldeliste) {
      const gespeichert = await gespeicherteTabelle(db, gruppeId);
      const gruppeZeile = await db.query.ligaGruppen.findFirst({
        where: eq(ligaGruppen.id, gruppeId),
        columns: { tabelleSynchronisiertAm: true },
      });
      const frisch =
        gespeichert.length > 0 &&
        !!gruppeZeile?.tabelleSynchronisiertAm &&
        jetzt.getTime() - gruppeZeile.tabelleSynchronisiertAm.getTime() < FRISCH_MS;
      // Frische Tabelle bzw. abgelaufenes Zeitlimit: gespeicherten Stand
      // nutzen, die Mannschaften werden trotzdem angelegt.
      tabelle =
        frisch || lauf.fristAbgelaufen()
          ? gespeichert
          : ((await aktualisiereGruppentabelle(
              db,
              lauf,
              verein.verband,
              gruppeId,
              team.gruppenId,
              team.championship
            )) ?? gespeichert);
    }
    gruppen.set(team.gruppenId, { gruppeId, tabelle });
  }

  // Mannschaften + Teilnahmen
  const gesehen: string[] = [];
  const belegteSchluessel = new Set<string>();
  for (const team of teams) {
    const norm = normalisiereMannschaft(team.mannschaftsname, team.ligaName);
    if (norm.entfaellt) continue;
    if (belegteSchluessel.has(norm.schluessel)) {
      lauf.warn(`Doppelte Mannschaft "${team.mannschaftsname}" übersprungen`);
      continue;
    }
    belegteSchluessel.add(norm.schluessel);
    const gruppe = gruppen.get(team.gruppenId)!;

    let mannschaft = await db.query.ligaMannschaften.findFirst({
      where: and(
        eq(ligaMannschaften.ligaVereinId, ligaVereinId),
        eq(ligaMannschaften.schluessel, norm.schluessel)
      ),
    });
    const stammdaten = {
      name: norm.anzeigename,
      kategorie: norm.kategorie,
      geschlecht: norm.geschlecht,
      altersklasse: norm.altersklasse,
      untergruppe: norm.untergruppe,
      nummer: norm.nummer,
      aktiv: true,
    };
    if (mannschaft) {
      await db.update(ligaMannschaften).set(stammdaten).where(eq(ligaMannschaften.id, mannschaft.id));
    } else {
      let slug = norm.slug;
      for (
        let i = 2;
        await db.query.ligaMannschaften.findFirst({
          where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.slug, slug)),
        });
        i++
      ) {
        slug = `${norm.slug}-${i}`;
      }
      [mannschaft] = await db
        .insert(ligaMannschaften)
        .values({ ligaVereinId, slug, schluessel: norm.schluessel, ...stammdaten })
        .returning();
      lauf.neu++;
    }

    const teamtable = ermittleTeamtable(
      { rang: team.rang, punkte: team.punkte, nummer: norm.nummer },
      gruppe.tabelle,
      vereinsname
    );
    if (!teamtable && gruppe.tabelle.length > 0) {
      // Mit Kontext, damit die Ursache direkt aus der Meldung ersichtlich
      // ist (Stand laut Vereinsliste und die Namen der Gruppentabelle).
      const namen = gruppe.tabelle
        .slice(0, 8)
        .map((z) => `${z.rang}. ${z.mannschaft}`)
        .join("; ");
      lauf.warn(
        `"${team.mannschaftsname}" (Gruppe ${team.gruppenId}): Tabellenzeile nicht zuordenbar ` +
          `(Vereinsliste: Platz ${team.rang ?? "?"}, ${team.punkte ? `${team.punkte.plus}:${team.punkte.minus}` : "?"} Punkte; ` +
          `Tabelle: ${namen})`
      );
    }

    const vorher = await db.query.ligaTeilnahmen.findFirst({
      where: and(
        eq(ligaTeilnahmen.mannschaftId, mannschaft.id),
        eq(ligaTeilnahmen.gruppeId, gruppe.gruppeId)
      ),
    });
    const werte = {
      saison,
      nuligaName: team.mannschaftsname,
      rang: team.rang,
      punktePlus: team.punkte?.plus ?? null,
      punkteMinus: team.punkte?.minus ?? null,
      nuligaTeamtableId: teamtable ?? vorher?.nuligaTeamtableId ?? null,
      aktiv: true,
      synchronisiertAm: new Date(),
    };
    if (vorher) {
      await db.update(ligaTeilnahmen).set(werte).where(eq(ligaTeilnahmen.id, vorher.id));
      if (
        vorher.rang !== werte.rang ||
        vorher.punktePlus !== werte.punktePlus ||
        vorher.nuligaTeamtableId !== werte.nuligaTeamtableId
      ) {
        lauf.aktualisiert++;
      }
      gesehen.push(vorher.id);
    } else {
      const [neu] = await db
        .insert(ligaTeilnahmen)
        .values({ mannschaftId: mannschaft.id, gruppeId: gruppe.gruppeId, ...werte })
        .returning({ id: ligaTeilnahmen.id });
      lauf.neu++;
      gesehen.push(neu.id);
    }
  }

  // Nicht mehr aufgeführte Teilnahmen/Mannschaften deaktivieren (nie löschen:
  // Historie und Favoriten bleiben erhalten).
  const alleMannschaften = await db.query.ligaMannschaften.findMany({
    where: eq(ligaMannschaften.ligaVereinId, ligaVereinId),
    columns: { id: true },
  });
  const mannschaftIds = alleMannschaften.map((m) => m.id);
  if (gesehen.length > 0 && mannschaftIds.length > 0) {
    await db
      .update(ligaTeilnahmen)
      .set({ aktiv: false })
      .where(
        and(inArray(ligaTeilnahmen.mannschaftId, mannschaftIds), notInArray(ligaTeilnahmen.id, gesehen))
      );
    const aktive = await db
      .selectDistinct({ id: ligaTeilnahmen.mannschaftId })
      .from(ligaTeilnahmen)
      .where(and(inArray(ligaTeilnahmen.mannschaftId, mannschaftIds), eq(ligaTeilnahmen.aktiv, true)));
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

  return protokolliere(db, ligaVereinId, "struktur", start, lauf, false);
}

export async function synchronisiereSpiele(
  ligaVereinId: string,
  { db, holeHtml, jetzt = new Date(), frist }: SyncOptionen
): Promise<SyncErgebnis> {
  const start = Date.now();
  const lauf = new Lauf(holeHtml, frist);
  const verein = await db.query.ligaVereine.findFirst({ where: eq(ligaVereine.id, ligaVereinId) });
  if (!verein) throw new Error("Liga-Verein nicht gefunden");

  const mannschaften = await db.query.ligaMannschaften.findMany({
    where: and(eq(ligaMannschaften.ligaVereinId, ligaVereinId), eq(ligaMannschaften.aktiv, true)),
    columns: { id: true },
  });
  const teilnahmen = mannschaften.length
    ? await db
        .select({ t: ligaTeilnahmen, g: ligaGruppen })
        .from(ligaTeilnahmen)
        .innerJoin(ligaGruppen, eq(ligaTeilnahmen.gruppeId, ligaGruppen.id))
        .where(
          and(
            inArray(
              ligaTeilnahmen.mannschaftId,
              mannschaften.map((m) => m.id)
            ),
            eq(ligaTeilnahmen.aktiv, true),
            eq(ligaGruppen.istMeldeliste, false)
          )
        )
    : [];

  const heute = tagKey(jetzt);
  const gruppenMitNeuemErgebnis = new Set<string>();

  // Älteste zuerst (nie geladene vorn), damit nach einem Zeitlimit die
  // übrigen beim nächsten Lauf drankommen.
  teilnahmen.sort(
    (a, b) => (a.t.spieleSynchronisiertAm?.getTime() ?? 0) - (b.t.spieleSynchronisiertAm?.getTime() ?? 0)
  );

  for (const { t, g } of teilnahmen) {
    if (!t.nuligaTeamtableId) continue;
    if (
      t.spieleSynchronisiertAm &&
      jetzt.getTime() - t.spieleSynchronisiertAm.getTime() < FRISCH_MS
    ) {
      continue;
    }
    if (lauf.fristAbgelaufen()) break;
    try {
      const html = await lauf.hole(
        baueNuligaUrl(verein.verband, "teamPortrait", {
          teamtable: t.nuligaTeamtableId,
          pageState: "vorrunde",
          championship: g.championship,
          group: g.nuligaGroupId,
        })
      );
      const { daten, warnungen } = parseTeamPortrait(html);
      for (const w of warnungen) lauf.warn(`${t.nuligaName}: ${w}`);
      if (daten.teamtableId !== t.nuligaTeamtableId) {
        lauf.fehler(`${t.nuligaName}: teamtable der Seite passt nicht, übersprungen`);
        continue;
      }
      if (daten.clubId && daten.clubId !== verein.nuligaClubId) {
        lauf.warn(`${t.nuligaName}: Portrait gehört zu Verein ${daten.clubId} (Spielgemeinschaft?)`);
      }
      const spiele = daten.spiele.filter((s) => s.spielnummer !== null);
      if (spiele.length < daten.spiele.length) {
        lauf.warn(`${t.nuligaName}: ${daten.spiele.length - spiele.length} Spiele ohne Spielnummer ignoriert`);
      }
      if (spiele.length === 0) continue; // nichts löschen, wenn Seite leer wirkt

      const tabelle = await gespeicherteTabelle(db, g.id);
      const namen = baueNamensIndex(
        tabelle.filter((z) => z.teamtableId).map((z) => ({ name: z.mannschaft, teamtableId: z.teamtableId! }))
      );

      // Eigene Mannschaft sicher zuordnen (siehe eigenerNameImPortrait).
      const eigenerName = eigenerNameImPortrait(spiele);
      if (eigenerName) namen.set(eigenerName, t.nuligaTeamtableId);

      const nummern = spiele.map((s) => s.spielnummer!);
      const bestehende = await db.query.ligaSpiele.findMany({
        where: and(eq(ligaSpiele.gruppeId, g.id), inArray(ligaSpiele.spielnummer, nummern)),
      });
      const nachNummer = new Map(bestehende.map((b) => [b.spielnummer, b]));

      for (const s of spiele) {
        const felder = spielZuFeldern(s, namen);
        const alt = nachNummer.get(s.spielnummer!);
        if (!alt) {
          await db.insert(ligaSpiele).values({ gruppeId: g.id, spielnummer: s.spielnummer!, ...felder });
          lauf.neu++;
          if (felder.toreHeim !== null) gruppenMitNeuemErgebnis.add(g.id);
        } else {
          const altFelder: SpielFelder = { ...alt };
          if (spielGeaendert(altFelder, felder)) {
            await db
              .update(ligaSpiele)
              .set({ ...felder, synchronisiertAm: new Date() })
              .where(eq(ligaSpiele.id, alt.id));
            lauf.aktualisiert++;
            if (ergebnisGeaendert(altFelder, felder)) gruppenMitNeuemErgebnis.add(g.id);
          }
        }
      }

      // Zukünftige Spiele dieser Mannschaft, die nuLiga nicht mehr führt
      // (z.B. Spielplan neu erstellt), entfernen — vergangene bleiben.
      await db.delete(ligaSpiele).where(
        and(
          eq(ligaSpiele.gruppeId, g.id),
          gte(ligaSpiele.datum, heute),
          notInArray(ligaSpiele.spielnummer, nummern),
          sql`(${ligaSpiele.heimTeamtableId} = ${t.nuligaTeamtableId} or ${ligaSpiele.gastTeamtableId} = ${t.nuligaTeamtableId})`
        )
      );
      await db
        .update(ligaTeilnahmen)
        .set({ spieleSynchronisiertAm: new Date() })
        .where(eq(ligaTeilnahmen.id, t.id));
    } catch (err) {
      lauf.fehler(`${t.nuligaName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Neues Ergebnis -> Tabelle der Gruppe frisch holen (eine Abfrage je Gruppe).
  for (const gruppeId of gruppenMitNeuemErgebnis) {
    if (lauf.fristAbgelaufen()) break;
    const g = teilnahmen.find((x) => x.g.id === gruppeId)!.g;
    await aktualisiereGruppentabelle(db, lauf, verein.verband, g.id, g.nuligaGroupId, g.championship);
  }

  return protokolliere(db, ligaVereinId, "spiele", start, lauf, false);
}

export async function synchronisiereVollstaendig(ligaVereinId: string, opt: SyncOptionen) {
  const struktur = await synchronisiereStruktur(ligaVereinId, opt);
  if (struktur.status === "fehler") return { struktur, spiele: null };
  const spiele = await synchronisiereSpiele(ligaVereinId, opt);
  return { struktur, spiele };
}
