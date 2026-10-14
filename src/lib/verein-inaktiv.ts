import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereine, vereinKontakt, vereinVorschauLinks } from "@/db/schema";
import { schreibeProtokoll } from "./treuhand";
import { erzeugeVorschauLink } from "./verein-vorschau";
import { sollInaktivWerden } from "./verein-inaktiv-regel";

// Inaktiv setzen: Vorschau-Links widerrufen und merken (verein_kontakt.inaktiv_seit). Nichts wird gelöscht; ein inaktiver Verein hat keinen
// gültigen Link, wird daher nicht abgerufen (sync-berechtigung) und nicht weiter angeschrieben (Erinnerung/Instagram-Nachfass überspringen ihn).
export async function setzeVereinInaktiv(vereinId: string, akteur: string): Promise<void> {
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (v?.status !== "vorbereitung") throw new Error("Nur Vereine in Vorbereitung können inaktiv gesetzt werden.");
  const jetzt = new Date();
  await adminDb.update(vereinVorschauLinks).set({ widerrufenAm: jetzt }).where(and(eq(vereinVorschauLinks.vereinId, vereinId), isNull(vereinVorschauLinks.widerrufenAm)));
  await adminDb
    .insert(vereinKontakt)
    .values({ vereinId, inaktivSeit: jetzt })
    .onConflictDoUpdate({ target: vereinKontakt.vereinId, set: { inaktivSeit: jetzt } });
  await schreibeProtokoll(vereinId, "inaktiv_gesetzt", akteur);
}

// Reaktivieren: neuer 7-Tage-Link (erzeugeVorschauLink leert inaktiv_seit). Die Daten holt der nächste Sync-Lauf nach.
export async function reaktiviereVerein(vereinId: string, akteur: string): Promise<void> {
  const [v] = await adminDb.select({ status: vereine.status }).from(vereine).where(eq(vereine.id, vereinId));
  if (v?.status !== "vorbereitung") throw new Error("Nur Vereine in Vorbereitung können reaktiviert werden.");
  await erzeugeVorschauLink(vereinId, 7, akteur);
  await schreibeProtokoll(vereinId, "reaktiviert", akteur);
}

// Täglich (Outreach-Cron): Vereine in Vorbereitung ohne Rückmeldung und ohne gültigen Link automatisch inaktiv setzen.
export async function markiereInaktiveVereine(jetzt = new Date()): Promise<{ inaktiv: number }> {
  const kandidaten = await adminDb
    .select({
      id: vereine.id,
      status: vereine.status,
      istDemo: vereine.istDemo,
      angeschriebenAm: vereinKontakt.angeschriebenAm,
      anspracheGesendetAm: vereinKontakt.anspracheGesendetAm,
      anspracheEmail: vereinKontakt.anspracheEmail,
      followupGesendetAm: vereinKontakt.followupGesendetAm,
      outreachAbgemeldetAm: vereinKontakt.outreachAbgemeldetAm,
      inaktivSeit: vereinKontakt.inaktivSeit,
      hatGueltigenLink: sql<boolean>`exists (select 1 from verein_vorschau_link l where l.verein_id = ${vereine.id} and l.widerrufen_am is null and l.gueltig_bis > ${jetzt})`,
    })
    .from(vereine)
    .innerJoin(vereinKontakt, eq(vereinKontakt.vereinId, vereine.id))
    .where(and(eq(vereine.status, "vorbereitung"), isNull(vereinKontakt.inaktivSeit)));
  let inaktiv = 0;
  for (const k of kandidaten) {
    if (!sollInaktivWerden(k, jetzt)) continue;
    await setzeVereinInaktiv(k.id, "Cron (keine Rückmeldung)");
    inaktiv++;
  }
  return { inaktiv };
}
