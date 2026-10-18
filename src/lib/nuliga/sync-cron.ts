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

// Spieltagsnähe eines Vereins: 3 = Spiel HEUTE (dringend, Ergebnisse), 2 = Spiel der letzten Tage ohne Ergebnis
// (gespielt, aber noch nicht eingetragen: so kommen sie am Folgetag vor allen anderen dran), 1 = Spiel gestern/morgen
// (spieltagsnah, häufiger synchronisieren), 0 = sonst (selten).
export const OFFENE_ERGEBNISSE_TAGE = 3;

async function spieltagsNaehe(
  db: SyncOptionen["db"],
  ligaVereinId: string,
  jetzt: Date
): Promise<0 | 1 | 2 | 3> {
  const von = tagKey(new Date(jetzt.getTime() - Math.max(1, OFFENE_ERGEBNISSE_TAGE) * TAG_MS));
  const bis = tagKey(new Date(jetzt.getTime() + TAG_MS));
  const heute = tagKey(jetzt);
  const treffer = await db
    .select({ datum: ligaSpiele.datum, status: ligaSpiele.status, toreHeim: ligaSpiele.toreHeim, bestaetigt: ligaSpiele.ergebnisBestaetigt })
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
  return bewerteSpieltagsNaehe(treffer, heute);
}

// Rein (testbar): Stufe aus den Spielen des Zeitfensters.
export function bewerteSpieltagsNaehe(
  spiele: { datum: string; status: string; toreHeim: number | null; bestaetigt: boolean }[],
  heute: string
): 0 | 1 | 2 | 3 {
  if (spiele.length === 0) return 0;
  if (spiele.some((t) => t.datum === heute)) return 3;
  // Vergangenes Spiel ohne endgültiges Ergebnis (fehlt oder nur vorläufig); abgesagte/verlegte/nicht angetretene zählen nicht.
  const offen = spiele.some(
    (t) => t.datum < heute && (t.status === "geplant" || t.status === "gespielt") && (t.toreHeim === null || !t.bestaetigt)
  );
  return offen ? 2 : 1;
}

export type FaelligeErgebnis = {
  ligaVereinId: string;
  slug: string;
  struktur?: string;
  spiele?: string;
  handballNet?: string;
  // Meldungen des handball.net-Laufs (z.B. "Zeitlimit erreicht", Fehler je Team): zur Diagnose unter /system/sync.
  handballNetMeldungen?: string[];
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
    // Von Hand: Intervall und 30-Minuten-Sperre übergehen, alles jetzt laden.
    erzwingen?: boolean;
    // Welche Quelle dieser Lauf bedient: "nuliga" (Cron liga-sync), "handball_net" (eigener Cron handball-net-sync, nur Vereine MIT
    // handball.net-Quelle und eigenes Budget) oder "alle" (Standard, z.B. von Hand unter /system/sync).
    quelle?: "alle" | "nuliga" | "handball_net";
    // Meldet den aktuellen Schritt (für den Watchdog der Cron-Route: wo hängt ein Lauf?)
    beiSchritt?: (text: string) => void;
  }
): Promise<FaelligeErgebnis> {
  const { db, jetzt = new Date(), budgetMs = 45_000, erzwingen = false, quelle = "alle" } = opt;
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
            sql`${vereinVorschauLinks.gueltigBis} > ${new Date(jetzts)}`
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
  let syncVereine = alleVereine.filter((v) => aktiveIds.has(v.id));
  // Je Quelle nur Vereine, die dort wirklich etwas haben: spart Abfragen und Budget.
  if (quelle === "nuliga") syncVereine = syncVereine.filter((v) => !!v.nuligaClubId);
  if (quelle === "handball_net") {
    const mitQuelle: typeof syncVereine = [];
    if (opt.holeJson) for (const v of syncVereine) if (await hatHandballNetQuelle(db, v)) mitQuelle.push(v);
    syncVereine = mitQuelle;
  }
  // Vereine mit Spielen heute zuerst, dann der am längsten nicht geladene: bei knapper Zeit
  // sind die aktuellen Ergebnisse sicher dran, der Rest folgt beim nächsten Lauf.
  const naehe = new Map<string, 0 | 1 | 2 | 3>();
  schritt("Spieltagsnähe berechnen");
  for (const v of syncVereine) naehe.set(v.id, await spieltagsNaehe(db, v.id, jetzt));
  // Innerhalb gleicher Dringlichkeit reihum nach dem letzten VERSUCH: ein Verein, dessen Lauf wegen des
  // Zeitlimits nie ganz fertig wird, behält seinen Zeitstempel "zuletzt vollständig" und stünde sonst
  // bei jedem Lauf wieder vorn — die übrigen kämen nie dran. Jeder Lauf schreibt ein Protokoll.
  const versuche = await db
    .select({ id: ligaSyncLaeufe.ligaVereinId, zuletzt: sql<Date>`max(${ligaSyncLaeufe.gestartetAm})` })
    .from(ligaSyncLaeufe)
    .where(
      inArray(
        ligaSyncLaeufe.art,
        quelle === "handball_net" ? ["handball_net"] : quelle === "nuliga" ? ["spiele"] : ["spiele", "handball_net"]
      )
    )
    .groupBy(ligaSyncLaeufe.ligaVereinId);
  const letzterVersuch = new Map(versuche.map((r) => [r.id, r.zuletzt ? new Date(r.zuletzt) : null]));
  const sortierteVereine = sortiereNachDringlichkeit(
    syncVereine,
    (v) => naehe.get(v.id) ?? 0,
    (v) =>
      letzterVersuch.get(v.id) ?? (quelle === "handball_net" ? v.handballNetSynchronisiertAm : v.spieleSynchronisiertAm)
  );
  const ergebnis: FaelligeErgebnis = [];
  const frist = start + budgetMs;

  for (const v of sortierteVereine) {
    if (Date.now() - start > budgetMs) break;
    const eintrag: FaelligeErgebnis[number] = { ligaVereinId: v.id, slug: v.slug };
    // Jede Quelle für sich: ein Fehler/Ausfall einer Quelle betrifft die andere nicht.
    const spieltagsnah = (naehe.get(v.id) ?? 0) > 0;
    const intervall = spieleIntervallMinuten(spieltagsnah);
    if (v.nuligaClubId && quelle !== "handball_net") {
      try {
        if (faellig(v.strukturSynchronisiertAm, STRUKTUR_INTERVALL_MINUTEN, jetzt)) {
          schritt(`${v.slug}: Struktur`);
          eintrag.struktur = (await synchronisiereStruktur(v.id, { ...opt, jetzt, frist })).status;
        }
        if (
          eintrag.struktur !== "fehler" &&
          (eintrag.struktur !== undefined || erzwingen || faellig(v.spieleSynchronisiertAm, intervall, jetzt))
        ) {
          schritt(`${v.slug}: nuLiga-Spiele`);
          eintrag.spiele = (await synchronisiereSpiele(v.id, { ...opt, jetzt, frist })).status;
        }
      } catch (err) {
        eintrag.struktur = `fehler: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    if (quelle !== "nuliga") schritt(`${v.slug}: handball.net prüfen`);
    if (quelle !== "nuliga" && opt.holeJson && (quelle === "handball_net" || (await hatHandballNetQuelle(db, v)))) {
      try {
        if (erzwingen || faellig(v.handballNetSynchronisiertAm, intervall, jetzt)) {
          schritt(`${v.slug}: handball.net-Spiele`);
          const hnet = await synchronisiereHandballNet(v.id, { db, holeJson: opt.holeJson, jetzt, frist });
          eintrag.handballNet = hnet.status;
          eintrag.handballNetMeldungen = hnet.meldungen;
        }
      } catch (err) {
        eintrag.handballNet = `fehler: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    // Freundschaftsspiele zuletzt und im selben Takt wie die Spiele (fertige
    // werden übersprungen): so verdrängen sie handball.net nicht aus dem Budget.
    if (v.nuligaClubId && quelle !== "handball_net" && eintrag.spiele !== undefined) {
      schritt(`${v.slug}: Freundschaftsspiele`);
      await synchronisiereFreundschaftsspieleSicher(v.id, { ...opt, jetzt, frist });
    }
    ergebnis.push(eintrag);
  }
  schritt("fertig");
  return ergebnis;
}
