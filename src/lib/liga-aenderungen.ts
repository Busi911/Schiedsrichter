import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaSpiele, termine, vereine } from "@/db/schema";
import { normalisiereName, ortWeichtAb } from "@/lib/hallenplan-abgleich";
import { parseBerlinDatumZeit } from "@/lib/format";
import { importiereRundenspielEreignisse } from "@/lib/rundenspiel-sync";
import type { RundenspielEreignis } from "@/lib/rundenspiel-import";
import {
  sendeRundenspielAenderungenBenachrichtigung,
  sendeVerlegungAnSchiedsrichterUndTrainerBenachrichtigungen,
  sendeZuordnungEntferntWegenVerlegungBenachrichtigungen,
} from "@/lib/rundenspiel-benachrichtigung";
import { schreibeProtokoll } from "@/lib/treuhand";

export type AenderungsErgebnis = {
  geprueft: number;
  verlegt: number;
  ergebnisse: number;
  entfernteZuordnungen: number;
};

const MINUTE_MS = 60_000;

// Übernimmt Verlegungen (Zeit; die Halle nur ZUSAMMEN mit einer Zeitänderung) und Ergebnisse aus den
// öffentlichen Liga-Daten in die mit dem Spiel VERKNÜPFTEN Termine eines Vereins. Ruft dafür den
// vorhandenen Import auf (rundenspiel-sync.ts, quelle "liga"): es gelten also dieselben Regeln wie
// beim Hallenplan-Import — bei einer Verlegung entfallen die Dienste außer Schiedsrichter, die
// betroffenen Personen werden benachrichtigt, der Vereinsadmin nach seinem Opt-in. Es ändert sich
// nur, was sich öffentlich tatsächlich geändert hat; unveränderte Termine, Ansetzung und Dienste
// bleiben unberührt. Eine reine Hallenabweichung ohne neue Zeit wird NICHT übernommen (kann nur ein
// anderer Hallenname sein, siehe Trockenlauf "Halle weicht ab").
export async function uebernehmeAenderungen(
  vereinId: string,
  akteur: string,
  jetzt = new Date()
): Promise<AenderungsErgebnis> {
  const leer: AenderungsErgebnis = { geprueft: 0, verlegt: 0, ergebnisse: 0, entfernteZuordnungen: 0 };
  const verein = await adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
  if (!verein) return leer;

  const zeilen = await adminDb
    .select({ termin: termine, spiel: ligaSpiele })
    .from(termine)
    .innerJoin(ligaSpiele, eq(ligaSpiele.id, termine.ligaSpielId))
    .where(and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel"), isNotNull(termine.icsUid)));

  const ereignisse: RundenspielEreignis[] = [];
  const mannschaftNachUid = new Map<string, string | null>();
  let verlegt = 0;
  let ergebnisse = 0;
  for (const { termin: t, spiel: s } of zeilen) {
    const spielStart = s.beginn ?? (s.uhrzeit ? parseBerlinDatumZeit(`${s.datum}T${s.uhrzeit}`) : null);
    const zeitGeaendert =
      !!spielStart &&
      !Number.isNaN(spielStart.getTime()) &&
      (s.status === "geplant" || s.status === "verlegt") &&
      t.start.getTime() >= jetzt.getTime() &&
      Math.abs(spielStart.getTime() - t.start.getTime()) >= MINUTE_MS;
    const neuerOrt = zeitGeaendert && s.halleName && ortWeichtAb(t.ort, s.halleName) ? s.halleName : null;
    const gleicheRichtung = normalisiereName(t.heimMannschaftName) === normalisiereName(s.heimName);
    // Neu eingetragen ODER korrigiert (z.B. vorläufiges Ergebnis, später berichtigt): der Termin
    // folgt dem öffentlichen Ergebnis. Ergebnisse verknüpfter Spiele kommen nur aus den Liga-Daten
    // (von Hand pflegbar sind nur Test- und Turnierspiele). Eine Korrektur löst keine Mail aus —
    // die Benachrichtigung gilt nur dem erstmals eingetragenen Ergebnis.
    const ergebnisNeu =
      s.toreHeim !== null &&
      s.toreGast !== null &&
      gleicheRichtung &&
      (t.ergebnisHeim !== s.toreHeim || t.ergebnisAuswaerts !== s.toreGast);
    if (!zeitGeaendert && !ergebnisNeu) continue;
    if (zeitGeaendert) verlegt++;
    if (ergebnisNeu) ergebnisse++;

    const uid = t.icsUid!;
    mannschaftNachUid.set(uid, t.mannschaftId);
    ereignisse.push({
      uid,
      start: zeitGeaendert ? spielStart! : t.start,
      ort: neuerOrt ?? t.ort ?? s.halleName ?? "",
      beschreibung: t.beschreibung ?? "",
      heimMannschaft: t.heimMannschaftName ?? s.heimName,
      auswaertsMannschaft: t.auswaertsMannschaftName ?? s.gastName,
      kategorie: t.kategorie,
      pflichtspiel: t.pflichtspiel ?? !s.istFreundschaft,
      freundschaftsTyp: t.freundschaftsTyp,
      ergebnisHeim: ergebnisNeu ? s.toreHeim : t.ergebnisHeim,
      ergebnisAuswaerts: ergebnisNeu ? s.toreGast : t.ergebnisAuswaerts,
      schiedsrichterKuerzel: t.nuligaSchiedsrichterKuerzel,
      angesetzterSchiedsrichter: t.handballNetSchiedsrichter,
      angesetzterZeitnehmer: t.handballNetZeitnehmer,
      hatSpielnummer: true,
    });
  }
  if (ereignisse.length === 0) return { ...leer, geprueft: zeilen.length };

  const r = await importiereRundenspielEreignisse(
    vereinId,
    ereignisse,
    (e) => mannschaftNachUid.get(e.uid) ?? null,
    { quelle: "liga" }
  );

  // Best effort wie beim Hallenplan-Import: ein Mailfehler macht die Übernahme nicht rückgängig.
  try {
    await sendeRundenspielAenderungenBenachrichtigung(verein, r.aenderungen);
  } catch (err) {
    console.error("Änderungs-Mail an den Admin konnte nicht gesendet werden:", err);
  }
  try {
    await sendeZuordnungEntferntWegenVerlegungBenachrichtigungen(verein, r.entfernteZuordnungen);
  } catch (err) {
    console.error("Verlegungs-Mail konnte nicht gesendet werden:", err);
  }
  try {
    await sendeVerlegungAnSchiedsrichterUndTrainerBenachrichtigungen(verein, r.aenderungen, r.entfernteZuordnungen);
  } catch (err) {
    console.error("Verlegungs-Info-Mail (Schiedsrichter/Trainer) konnte nicht gesendet werden:", err);
  }

  await schreibeProtokoll(
    vereinId,
    "liga_aenderungen",
    akteur,
    `${verlegt} verlegt, ${ergebnisse} Ergebnisse, ${r.entfernteZuordnungen.length} Zuordnungen mit Login bei Verlegung entfernt`
  );
  return { geprueft: zeilen.length, verlegt, ergebnisse, entfernteZuordnungen: r.entfernteZuordnungen.length };
}
