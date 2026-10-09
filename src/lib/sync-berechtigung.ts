import "server-only";
import { eq, or, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";

// Externe Daten (nuLiga, handball.net, NDR) werden NUR für Vereine abgerufen, die jemand nutzt: der Verein ist AKTIV, oder er ist in Vorbereitung
// UND hat einen gültigen (nicht widerrufenen, nicht abgelaufenen) Vorschau-Link. Alles andere (z.B. automatisch angelegte Outreach-Kandidaten)
// erzeugt keinen Datenverkehr. Jeder Cron, der von außen abruft, filtert über diese EINE Stelle (der Liga-Sync prüft dasselbe in sync-cron.ts).
export async function holeSyncBerechtigteVereinIds(jetzt = new Date()): Promise<Set<string>> {
  const zeilen = await adminDb
    .select({ id: vereine.id })
    .from(vereine)
    .where(
      or(
        eq(vereine.status, "aktiv"),
        sql`exists (
          select 1 from verein_vorschau_link l
          where l.verein_id = ${vereine.id} and l.widerrufen_am is null and l.gueltig_bis > ${jetzt}
        )`
      )
    );
  return new Set(zeilen.map((z) => z.id));
}
