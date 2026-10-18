import "server-only";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaQuellenAbrufe, ligaSyncLaeufe, ligaVereine, ligaVereinZusatzquellen, vereine } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import type { EmailInhalt } from "@/lib/email-layout";
import { entscheideMeldung, pruefeSync, type Befund, type Entscheidung, type NdrSeite, type Snapshot, type VereinSync, type Zustand } from "@/lib/sync-ueberwachung";
import { mailAnSystemAdmins } from "@/lib/system-admin-benachrichtigung";

// Ablage des Meldezustands ohne eigene Tabelle: eine Zeile in liga_quelle_abruf (nur adminDb), wie die Abruf-Status der Spieltagsquellen.
const ZUSTAND_QUELLE = "ueberwachung";
const ZUSTAND_SCHLUESSEL = "zustand";
const LAEUFE_TAGE = 3;
const LAEUFE_JE_VEREIN = 5;

/** Liest den aktuellen Stand der Abgleiche aus der Datenbank (nur aktive Vereine, ohne Demo). */
export async function ladeSnapshot(jetzt: Date = new Date()): Promise<Snapshot> {
  const [zeilen, zusatz, laeufeRoh, ndr, ansetzung] = await Promise.all([
    adminDb
      .select({
        id: ligaVereine.id,
        name: vereine.name,
        erstelltAm: ligaVereine.erstelltAm,
        nuligaClubId: ligaVereine.nuligaClubId,
        handballNetClubId: ligaVereine.handballNetClubId,
        handballNetTeamIds: ligaVereine.handballNetTeamIds,
        spieleAm: ligaVereine.spieleSynchronisiertAm,
        handballNetAm: ligaVereine.handballNetSynchronisiertAm,
        uebernahmeAktiv: vereine.ligaUebernahmeAktiv,
        uebernahmeGeprueftAm: vereine.ligaUebernahmeGeprueftAm,
      })
      .from(ligaVereine)
      .innerJoin(vereine, eq(vereine.id, ligaVereine.vereinId))
      .where(and(eq(vereine.status, "aktiv"), eq(vereine.istDemo, false))),
    adminDb.select({ id: ligaVereinZusatzquellen.ligaVereinId }).from(ligaVereinZusatzquellen).where(isNotNull(ligaVereinZusatzquellen.handballNetClubId)),
    adminDb
      .select({ id: ligaSyncLaeufe.ligaVereinId, art: ligaSyncLaeufe.art, status: ligaSyncLaeufe.status, gestartetAm: ligaSyncLaeufe.gestartetAm })
      .from(ligaSyncLaeufe)
      .where(gte(ligaSyncLaeufe.gestartetAm, new Date(jetzt.getTime() - LAEUFE_TAGE * 24 * 3_600_000)))
      .orderBy(desc(ligaSyncLaeufe.gestartetAm)),
    adminDb
      .select({ schluessel: ligaQuellenAbrufe.schluessel, letzterVersuchAm: ligaQuellenAbrufe.letzterVersuchAm, letzterErfolgAm: ligaQuellenAbrufe.letzterErfolgAm, letzterFehler: ligaQuellenAbrufe.letzterFehler })
      .from(ligaQuellenAbrufe)
      .where(eq(ligaQuellenAbrufe.quelle, "ndr")),
    adminDb
      .select({ gruppen: sql<number>`count(*)::int`, neuesteAm: sql<Date | null>`max(${ligaGruppen.ansetzungGeprueftAm})` })
      .from(ligaGruppen)
      .where(isNotNull(ligaGruppen.ansetzungGeprueftAm)),
  ]);

  const hatZusatz = new Set(zusatz.map((z) => z.id));
  const laeufe = new Map<string, VereinSync["laeufe"]>();
  for (const l of laeufeRoh) {
    const liste = laeufe.get(l.id) ?? [];
    if (liste.length < LAEUFE_JE_VEREIN * 3) liste.push({ art: l.art, status: l.status, gestartetAm: l.gestartetAm });
    laeufe.set(l.id, liste);
  }
  return {
    jetzt,
    vereine: zeilen.map((z) => ({
      id: z.id,
      name: z.name,
      nuliga: !!z.nuligaClubId,
      handballNet: !!(z.handballNetClubId || z.handballNetTeamIds || hatZusatz.has(z.id)),
      erstelltAm: z.erstelltAm,
      spieleAm: z.spieleAm,
      handballNetAm: z.handballNetAm,
      uebernahmeAktiv: z.uebernahmeAktiv,
      uebernahmeGeprueftAm: z.uebernahmeGeprueftAm,
      laeufe: laeufe.get(z.id) ?? [],
    })),
    ndrSeiten: ndr satisfies NdrSeite[],
    ansetzung: { gruppen: ansetzung[0]?.gruppen ?? 0, neuesteAm: ansetzung[0]?.neuesteAm ? new Date(ansetzung[0].neuesteAm) : null },
  };
}

/** Nur lesen: die aktuellen Befunde (für die Anzeige unter /system/sync und für Abfragen von außen). */
export async function berechneBefunde(jetzt: Date = new Date()): Promise<Befund[]> {
  return pruefeSync(await ladeSnapshot(jetzt));
}

async function ladeZustand(): Promise<Zustand> {
  const zeile = await adminDb.query.ligaQuellenAbrufe.findFirst({
    where: and(eq(ligaQuellenAbrufe.quelle, ZUSTAND_QUELLE), eq(ligaQuellenAbrufe.schluessel, ZUSTAND_SCHLUESSEL)),
    columns: { meta: true },
  });
  return ((zeile?.meta as { zustand?: Zustand } | null)?.zustand ?? {}) as Zustand;
}

async function speichereZustand(zustand: Zustand, jetzt: Date): Promise<void> {
  await adminDb
    .insert(ligaQuellenAbrufe)
    .values({ quelle: ZUSTAND_QUELLE, schluessel: ZUSTAND_SCHLUESSEL, letzterVersuchAm: jetzt, letzterErfolgAm: jetzt, status: "ok", meta: { zustand } })
    .onConflictDoUpdate({
      target: [ligaQuellenAbrufe.quelle, ligaQuellenAbrufe.schluessel],
      set: { letzterVersuchAm: jetzt, letzterErfolgAm: jetzt, meta: { zustand } },
    });
}

const GRUPPEN_NAMEN: Record<string, string> = {
  "nuliga-veraltet": "nuLiga: Abruf veraltet",
  "nuliga-fehler": "nuLiga: Abruf schlägt fehl",
  "hnet-veraltet": "handball.net: Abruf veraltet",
  "hnet-fehler": "handball.net: Abruf schlägt fehl",
  "uebernahme-veraltet": "Übernahme veraltet",
  "ansetzung-veraltet": "Ansetzung veraltet",
};

export function ueberwachungsMailInhalt(entscheidung: Pick<Entscheidung, "senden" | "behoben">): EmailInhalt {
  const zeilen: string[] = [];
  for (const b of entscheidung.senden) zeilen.push(b.titel, ...b.zeilen.map((z) => `• ${z}`));
  if (entscheidung.behoben.length > 0) {
    zeilen.push(`Wieder in Ordnung: ${entscheidung.behoben.map((g) => GRUPPEN_NAMEN[g] ?? (g.startsWith("ndr-") ? `NDR ${g.slice(4).toUpperCase()}: Seiten nicht ladbar` : g)).join(", ")}.`);
  }
  return {
    ueberschrift: entscheidung.senden.length > 0 ? "Überwachung: Auffälligkeiten bei den Abgleichen" : "Überwachung: wieder alles in Ordnung",
    zeilen,
    cta: { text: "Zur Überwachung", url: `${appUrl()}/system/sync` },
    kleingedrucktes: "Jeder Befund wird einmal gemeldet, bei weiteren betroffenen Vereinen sofort wieder und sonst höchstens einmal täglich als Erinnerung.",
  };
}

export type UeberwachungsLauf = { befunde: Befund[]; gemeldet: number; behoben: number };

/** Prüft, merkt sich den Meldezustand und schickt bei Bedarf EINE Mail an alle Systemadmins. `nurPruefen`: weder Mail noch Zustand (z.B. Abfrage von außen). */
export async function fuehreUeberwachungAus(opt: { jetzt?: Date; nurPruefen?: boolean } = {}): Promise<UeberwachungsLauf> {
  const jetzt = opt.jetzt ?? new Date();
  const befunde = await berechneBefunde(jetzt);
  if (opt.nurPruefen) return { befunde, gemeldet: 0, behoben: 0 };
  const entscheidung = entscheideMeldung(await ladeZustand(), befunde, jetzt);
  if (entscheidung.senden.length > 0 || entscheidung.behoben.length > 0) {
    const betreff = entscheidung.senden.length > 0 ? `Überwachung: ${entscheidung.senden.length} Auffälligkeit${entscheidung.senden.length === 1 ? "" : "en"} bei den Abgleichen` : "Überwachung: wieder alles in Ordnung";
    await mailAnSystemAdmins(betreff, ueberwachungsMailInhalt(entscheidung));
  }
  // Zustand erst nach dem Mailversuch (der Versand fängt Fehler je Empfänger selbst ab): ein Fehler davor ließe die Meldung beim nächsten Lauf wiederholen.
  await speichereZustand(entscheidung.zustand, jetzt);
  return { befunde, gemeldet: entscheidung.senden.length, behoben: entscheidung.behoben.length };
}
