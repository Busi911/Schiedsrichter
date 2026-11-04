import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { mitColdStartRetry } from "@/db/retry";
import { ligaMannschaften, ligaVereine, mannschaftSponsoren } from "@/db/schema";
import { sponsorWirksam } from "@/lib/sponsor";

// Sponsor einer Mannschaft (vom Verein selbst gepflegt). Unabhängig vom Vereinssponsor in lib/sponsor.ts:
// gleiche Bildprüfung und Wirksamkeitsregel (aktiv + Bild + Zeitraum), aber ohne Vollbild und ohne Einfluss auf
// die Abrechnung. Die Regeln "wirkt heute?" und Bild/Link-Prüfung werden bewusst von dort wiederverwendet.

const heuteBerlin = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

export type MannschaftSponsorAnsicht = { name: string | null; link: string | null; version: string };

// Öffentliche Mannschaftsseite: der wirksame Sponsor oder null. Lädt das Bild nicht mit. `vereinId` ist der
// Mandant (liga_verein.verein_id) und wird IMMER mitgefiltert (öffentlich, über adminDb, ohne RLS-Schutz).
export async function holeMannschaftSponsor(
  vereinId: string,
  ligaMannschaftId: string
): Promise<MannschaftSponsorAnsicht | null> {
  const [z] = await mitColdStartRetry(() =>
    adminDb
      .select({
        aktiv: mannschaftSponsoren.aktiv,
        name: mannschaftSponsoren.name,
        link: mannschaftSponsoren.link,
        gueltigBis: mannschaftSponsoren.gueltigBis,
        aktualisiert: mannschaftSponsoren.aktualisiertAm,
        hatBild: sql<boolean>`${mannschaftSponsoren.bild} is not null`,
      })
      .from(mannschaftSponsoren)
      .where(and(eq(mannschaftSponsoren.vereinId, vereinId), eq(mannschaftSponsoren.ligaMannschaftId, ligaMannschaftId)))
  );
  if (!z || !sponsorWirksam({ aktiv: z.aktiv, hatBild: z.hatBild, gueltigBis: z.gueltigBis }, heuteBerlin())) return null;
  return { name: z.name, link: z.link, version: String(z.aktualisiert.getTime()) };
}

export async function holeMannschaftSponsorBild(vereinId: string, ligaMannschaftId: string): Promise<Buffer | null> {
  const [z] = await mitColdStartRetry(() =>
    adminDb
      .select({ bild: mannschaftSponsoren.bild })
      .from(mannschaftSponsoren)
      .where(and(eq(mannschaftSponsoren.vereinId, vereinId), eq(mannschaftSponsoren.ligaMannschaftId, ligaMannschaftId)))
  );
  return z?.bild ?? null;
}

export type SponsorZeile = {
  ligaMannschaftId: string;
  aktiv: boolean;
  name: string | null;
  link: string | null;
  gueltigBis: string | null;
  hatBild: boolean;
  wirksam: boolean;
};

// Admin: alle Sponsoren des eigenen Vereins (ohne die Bilder selbst).
export async function ladeSponsorenDesVereins(vereinId: string): Promise<Map<string, SponsorZeile>> {
  const heute = heuteBerlin();
  const zeilen = await withTenant(vereinId, (tx) =>
    tx
      .select({
        ligaMannschaftId: mannschaftSponsoren.ligaMannschaftId,
        aktiv: mannschaftSponsoren.aktiv,
        name: mannschaftSponsoren.name,
        link: mannschaftSponsoren.link,
        gueltigBis: mannschaftSponsoren.gueltigBis,
        hatBild: sql<boolean>`${mannschaftSponsoren.bild} is not null`,
      })
      .from(mannschaftSponsoren)
      .where(eq(mannschaftSponsoren.vereinId, vereinId))
  );
  return new Map(
    zeilen.map((z) => [
      z.ligaMannschaftId,
      { ...z, wirksam: sponsorWirksam({ aktiv: z.aktiv, hatBild: z.hatBild, gueltigBis: z.gueltigBis }, heute) },
    ])
  );
}

// liga_mannschaft hat keine RLS: die Policy von mannschaft_sponsor prüft nur verein_id. Deshalb MUSS jede Action
// vor dem Speichern prüfen, dass die Mannschaft wirklich zum eigenen Verein gehört (sonst könnte ein Admin
// einen Sponsor an die Mannschaft eines fremden Vereins hängen).
export async function mannschaftGehoertZumVerein(vereinId: string, ligaMannschaftId: string): Promise<boolean> {
  const [z] = await adminDb
    .select({ id: ligaMannschaften.id })
    .from(ligaMannschaften)
    .innerJoin(ligaVereine, eq(ligaVereine.id, ligaMannschaften.ligaVereinId))
    .where(and(eq(ligaMannschaften.id, ligaMannschaftId), eq(ligaVereine.vereinId, vereinId)));
  return !!z;
}
