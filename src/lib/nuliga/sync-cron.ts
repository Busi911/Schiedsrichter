import { and, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { ligaMannschaften, ligaSpiele, ligaSyncLaeufe, ligaTeilnahmen, ligaVereine, vereine, vereinVorschauLinks } from "@/db/schema";
import { tagKey } from "@/lib/kalender";
import {
  STRUKTUR_INTERVALL_MINUTEN,
  sortiereNachDringlichkeit,
  spieleIntervallMinuten,
} from "./sync-hilfen";
import type { HoleJson } from "@/lib/handball-net/client";
import { hatHandballNetQuelle, synchronisiereHandballNet } from "@/lib/handball-net/sync";
import {
  synchronisiereFreundschaftsspieleSicher,
  synchronisiereSpiele,
  synchronisiereStruktur,
  type SyncOptionen,
} from "./sync";

const MINUTE_MS = 60_000;
const TAG_MS = 24 * 60 * MINUTE_MS;

function faellig(letzter: Date | null, intervallMinuten: number, jetzt: Date): boolean {
  return !letzter || jetzt.getTime() - letzter.getTime() >= intervallMinuten * MINUTE_MS;
}

// Spieltagsnähe eines Vereins: 2 = Spiel HEUTE (dringend, Ergebnisse), 1 = Spiel gestern/morgen
// (spieltagsnah, häufiger synchronisieren), 0 = sonst (selten).
async function spieltagsNaehe(
  db: SyncOptionen["db"],
  ligaVereinId: string,
  jetzt: Date
): Promise<0 | 1 | 2> {
  const von = tagKey(new Date(jetzt.getTime() - TAG_MS));
  const bis = tagKey(new Date(jetzt.getTime() + TAG_MS));
  const heute = tagKey(jetzt);
  const treffer = await db
    .select({ datum: ligaSpiele.datum })
    .from(ligaSpiele)
    .innerJoin(
      ligaTeilnahmen,
      and(
        eq(ligaTeilnahmen.gruppeId, ligaSpiele.gruppeId),
        isNotNull(ligaTeilnahmen.nuligaTeamtableId),
        or(
          eq(ligaSpiele.heimTeamtableId, ligaTeilnahmen.nuligaTeamtableId),
          eq(ligaSpiele.gastTeamtableId, ligaTeilnahmen.nuligaTeamtableId)
        )
      )
    )
    .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
    .where(
      and(
        eq(ligaMannschaften.ligaVereinId, ligaVereinId),
        gte(ligaSpiele.datum, von),
        lte(ligaSpiele.datum, bis)
      )
    );
  if (treffer.length === 0) return 0;
  return treffer.some((t) => t.datum === heute) ? 2 : 1;
}

export type FaelligeErgebnis = {
  ligaVereinId: string;
  slug: string;
  struktur?: string;
  spiele?: string;
  handballNet?: string;
}[];

// Vom Cron aufgerufen (beliebig oft): entscheidet pro Verein, was fällig ist
// — Struktur ca. 1x täglich, Spiele spieltagsnah alle ~45 Min, sonst alle
// ~6 Std. `budgetMs` begrenzt die Laufzeit (Serverless-Timeout): bleibt
// etwas liegen, kommt es beim nächsten Aufruf dran.
export async function synchronisiereFaellige(
  opt: SyncOptionen & {
    budgetMs?: number;
    nurVereinId?: string;
    holeJson?: HoleJson;
    // Meldet den aktuellen Schritt (für den Watchdog der Cron-Route: wo hängt ein Lauf?)
    beiSchritt?: (text: string) => void;
  }
): Promise<FaelligeErgebnis> {
  const { db, jetzt = new Date(), budgetMs = 45_000 } = opt;
  const start = Date.now();
  const schritt = opt.beiSchritt ?? (() => {});
  schritt("Vereine laden");
  // Nur Vereine syncen, die entweder aktiv sind ODER sich in Vorbereitung
  // mit einem gültigen (nicht widerrufenen, nicht abgelaufenen) Vorschau-Link
  // befinden — sonst syncen wir Vereine, die niemand nutzt (Outreach-Kandidaten
  // ohne Interesse, die nur Datenverkehr erzeugen).
  const jetzts = jetzt.getTime();
  const alleVereine = await db.query.ligaVereine.findMany({
    where: opt.nurVereinId ? eq(ligaVereine.id, opt.nurVereinId) : sql`true`,
  });
  // Vereine im Status "vorbereitung" ohne gültigen Vorschau-Link herausfiltern.
  const aktiveIds = new Set<string>();
  if (!opt.nurVereinId) {
    // Join mit vereine-Tabelle, um den Status zu prüfen.
    const vereineStatus = await db
      .select({ id: vereine.id, status: vereine.status })
      .from(vereine)
      .where(inArray(vereine.id, alleVereine.map((v) => v.vereinId)));
    const vorbereitungVereinIds = new Set(
      vereineStatus.filter((v) => v.status === "vorbereitung").map((v) => v.id)
    );
    if (vorbereitungVereinIds.size > 0) {
      // Gültige Vorschau-Links: nicht widerrufen, nicht abgelaufen.
      const gueltigeLinks = await db
        .select({ vereinId: vereinVorschauLinks.vereinId })
        .from(vereinVorschauLinks)
        .where(
          and(
            inArray(vereinVorschauLinks.vereinId, [...vorbereitungVereinIds]),
            sql`${vereinVorschauLinks.widerrufenAm} IS NULL`,
            sql`${vereinVorschauLinks.gueltigBis} > ${jetzts}`
          )
        );
      const mitGueltigemLink = new Set(gueltigeLinks.map((l) => l.vereinId));
      // Nur Vorbereitungs-Vereine mit gültigem Link dürfen in den Sync;
      // aktive Vereine immer.
      for (const lv of alleVereine) {
        if (vorbereitungVereinIds.has(lv.vereinId) && !mitGueltigemLink.has(lv.vereinId)) {
          continue; // überspringen — kein gültiger Vorschau-Link
        }
        aktiveIds.add(lv.id);
      }
    } else {
      for (const lv of alleVereine) aktiveIds.add(lv.id);
    }
  } else {
    for (const lv of alleVereine) aktiveIds.add(lv.id);
  }
  const syncVereine = alleVereine.filter((v) => aktiveIds.has(v.id));
  // Vereine mit Spielen heute zuerst, dann der am längsten nicht geladene: bei knapper Zeit
  // sind die aktuellen Ergebnisse sicher dran, der Rest folgt beim nächsten Lauf.
  const naehe = new Map<string, 0 | 1 | 2>();
  schritt("Spieltagsnähe berechnen");
  for (const v of syncVereine) naehe.set(v.id, await spieltagsNaehe(db, v.id, jetzt));
  // Innerhalb gleicher Dringlichkeit reihum nach dem letzten VERSUCH: ein Verein, dessen Lauf wegen des
  // Zeitlimits nie ganz fertig wird, behält seinen Zeitstempel "zuletzt vollständig" und stünde sonst
  // bei jedem Lauf wieder vorn — die übrigen kämen nie dran. Jeder Lauf schreibt ein Protokoll.
  const versuche = await db
    .select({ id: ligaSyncLaeufe.ligaVereinId, zuletzt: sql<Date>`max(${ligaSyncLaeufe.gestartetAm})` })
    .from(ligaSyncLaeufe)
    .where(inArray(ligaSyncLaeufe.art, ["spiele", "handball_net"]))
    .groupBy(ligaSyncLaeufe.ligaVereinId);
  const letzterVersuch = new Map(versuche.map((r) => [r.id, r.zuletzt ? new Date(r.zuletzt) : null]));
  const sortierteVereine = sortiereNachDringlichkeit(
    syncVereine,
    (v) => naehe.get(v.id) ?? 0,
    (v) => letzterVersuch.get(v.id) ?? v.spieleSynchronisiertAm
  );
  const ergebnis: FaelligeErgebnis = [];
  const frist = start + budgetMs;

  for (const v of sortierteVereine) {
    if (Date.now() - start > budgetMs) break;
    const eintrag: FaelligeErgebnis[number] = { ligaVereinId: v.id, slug: v.slug };
    // Jede Quelle für sich: ein Fehler/Ausfall einer Quelle betrifft die andere nicht.
    const spieltagsnah = (naehe.get(v.id) ?? 0) > 0;
    const intervall = spieleIntervallMinuten(spieltagsnah);
    if (v.nuligaClubId) {
      try {
        if (faellig(v.strukturSynchronisiertAm, STRUKTUR_INTERVALL_MINUTEN, jetzt)) {
          schritt(`${v.slug}: Struktur`);
          eintrag.struktur = (await synchronisiereStruktur(v.id, { ...opt, jetzt, frist })).status;
        }
        if (
          eintrag.struktur !== "fehler" &&
          (eintrag.struktur !== undefined || faellig(v.spieleSynchronisiertAm, intervall, jetzt))
        ) {
          schritt(`${v.slug}: nuLiga-Spiele`);
          eintrag.spiele = (await synchronisiereSpiele(v.id, { ...opt, jetzt, frist })).status;
        }
      } catch (err) {
        eintrag.struktur = `fehler: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    schritt(`${v.slug}: handball.net prüfen`);
    if (opt.holeJson && (await hatHandballNetQuelle(db, v))) {
      try {
        if (faellig(v.handballNetSynchronisiertAm, intervall, jetzt)) {
          schritt(`${v.slug}: handball.net-Spiele`);
          eintrag.handballNet = (
            await synchronisiereHandballNet(v.id, { db, holeJson: opt.holeJson, jetzt, frist })
          ).status;
        }
      } catch (err) {
        eintrag.handballNet = `fehler: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    // Freundschaftsspiele zuletzt und im selben Takt wie die Spiele (fertige
    // werden übersprungen): so verdrängen sie handball.net nicht aus dem Budget.
    if (v.nuligaClubId && eintrag.spiele !== undefined) {
      schritt(`${v.slug}: Freundschaftsspiele`);
      await synchronisiereFreundschaftsspieleSicher(v.id, { ...opt, jetzt, frist });
    }
    ergebnis.push(eintrag);
  }
  schritt("fertig");
  return ergebnis;
}
