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

// Nach so langer Zeit ohne vollständigen Spiele-Abruf gilt ein Verein als veraltet.
export const VERALTET_NACH_MS = 24 * 60 * MINUTE_MS;

// Rang für die Reihenfolge: veraltete Vereine (kein vollständiger Abruf seit 24 h oder nie) mindestens 1.
export function rangMitVeraltung(naehe: 0 | 1 | 2 | 3, zuletztVollstaendig: Date | null, jetzt: Date): 0 | 1 | 2 | 3 {
  if (naehe > 0) return naehe;
  return !zuletztVollstaendig || jetzt.getTime() - zuletztVollstaendig.getTime() > VERALTET_NACH_MS ? 1 : 0;
}

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
  // Vergangenes Spiel ohne endgültiges Ergebnis (fehlt oder nur vorläufig); abgesagte/nicht angetretene zählen nicht.
  // "verlegt" zählt mit: das gespeicherte Datum ist der NEUE Termin, nuLiga lässt das "v" auch nach dem Spiel stehen — ein nachgeholtes Spiel ohne
  // Ergebnis muss zügig nachgeladen werden (sonst bleibt es bei "Verlegt / Ergebnis ausstehend", obwohl nuLiga das Ergebnis schon zeigt).
  const offen = spiele.some(
    (t) => t.datum < heute && (t.status === "geplant" || t.status === "verlegt" || t.status === "gespielt") && (t.toreHeim === null || !t.bestaetigt)
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

export type FaelligeLauf = {
  ergebnisse: FaelligeErgebnis;
  // true = jeder für diesen Lauf ausgewählte Verein wurde erreicht (das Budget hat gereicht); false = das Budget
  // ist ausgegangen, bevor alle dran waren — ein weiterer Lauf (Cron oder von Hand) setzt beim nächsten fort.
  vollstaendig: boolean;
};

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
): Promise<FaelligeLauf> {
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
  // Ein Verein mit veralteten Daten bekommt für die REIHENFOLGE mindestens Rang 1 (`rangMitVeraltung`),
  // sonst stünde seine Spieltagsnähe auf 0 (keine heutigen Spiele in der DB, weil die Daten alt sind)
  // und er käme bei knapper Zeit nie dran (Teufelskreis). Das Intervall richtet sich weiter nach der
  // echten Nähe (`naehe`): ein Verein, dessen Lauf nie fertig wird, wird nicht alle 45 Min. versucht.
  const naehe = new Map<string, 0 | 1 | 2 | 3>();
  const rang = new Map<string, 0 | 1 | 2 | 3>();
  schritt("Spieltagsnähe berechnen");
  for (const v of syncVereine) {
    const n = await spieltagsNaehe(db, v.id, jetzt);
    naehe.set(v.id, n);
    rang.set(v.id, rangMitVeraltung(n, v.spieleSynchronisiertAm, jetzt));
  }
  // Innerhalb gleicher Dringlichkeit reihum nach dem letzten VERSUCH: ein Verein, dessen Lauf wegen des
  // Zeitlimits nie ganz fertig wird, behält seinen Zeitstempel "zuletzt vollständig" und stünde sonst
  // bei jedem Lauf wieder vorn — die übrigen kämen nie dran. Jeder Lauf schreibt ein Protokoll.
  // Auch den letzten STRUKTUR-Versuch laden: eine abgebrochene Struktur setzt den Zeitstempel nicht,
  // wäre sonst immer fällig und frisst jedes Mal das ganze Budget — die Spiele kämen nie dran.
  const versuche = await db
    .select({ id: ligaSyncLaeufe.ligaVereinId, art: ligaSyncLaeufe.art, zuletzt: sql<Date>`max(${ligaSyncLaeufe.gestartetAm})` })
    .from(ligaSyncLaeufe)
    .where(
      inArray(
        ligaSyncLaeufe.art,
        quelle === "handball_net" ? ["handball_net"] : quelle === "nuliga" ? ["spiele", "struktur"] : ["spiele", "struktur", "handball_net"]
      )
    )
    .groupBy(ligaSyncLaeufe.ligaVereinId, ligaSyncLaeufe.art);
  const letzterVersuch = new Map<string, Date | null>();
  const letzterStrukturVersuch = new Map<string, Date | null>();
  for (const r of versuche) {
    const d = r.zuletzt ? new Date(r.zuletzt) : null;
    if (r.art === "struktur") letzterStrukturVersuch.set(r.id, d);
    else {
      // "spiele" und "handball_net" teilen sich eine Map: der jüngere Versuch zählt.
      const bisher = letzterVersuch.get(r.id);
      if (!bisher || (d && d > bisher)) letzterVersuch.set(r.id, d);
    }
  }
  const sortierteVereine = sortiereNachDringlichkeit(
    syncVereine,
    (v) => rang.get(v.id) ?? 0,
    (v) =>
      letzterVersuch.get(v.id) ?? (quelle === "handball_net" ? v.handballNetSynchronisiertAm : v.spieleSynchronisiertAm)
  );
  const ergebnis: FaelligeErgebnis = [];
  const frist = start + budgetMs;

  // Struktur-Sync überspringen, wenn er kürzlich VERSUCHT wurde (auch unvollständig):
  // Eine abgebrochene Struktur setzt strukturSynchronisiertAm nicht, wäre sonst immer
  // fällig und frisst jedes Mal das ganze Budget — die Spiele kämen nie dran.
  // Nach Ablauf der Sperrfrist (2h) wird die Struktur erneut versucht.
  const STRUKTUR_VERSUCH_MS = 2 * 60 * 60 * 1000;

  for (const v of sortierteVereine) {
    if (Date.now() - start > budgetMs) break;
    const eintrag: FaelligeErgebnis[number] = { ligaVereinId: v.id, slug: v.slug };
    // Jede Quelle für sich: ein Fehler/Ausfall einer Quelle betrifft die andere nicht.
    const spieltagsnah = (naehe.get(v.id) ?? 0) > 0;
    const intervall = spieleIntervallMinuten(spieltagsnah);
    if (v.nuligaClubId && quelle !== "handball_net") {
      const strukturZuletzt = letzterStrukturVersuch.get(v.id);
      const strukturUeberspringen =
        !!strukturZuletzt && jetzt.getTime() - strukturZuletzt.getTime() < STRUKTUR_VERSUCH_MS;
      try {
        if (!strukturUeberspringen && faellig(v.strukturSynchronisiertAm, STRUKTUR_INTERVALL_MINUTEN, jetzt)) {
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
  return { ergebnisse: ergebnis, vollstaendig: ergebnis.length === sortierteVereine.length };
}
