import "server-only";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { mitColdStartRetry } from "@/db/retry";
import { ligaMannschaften, neuigkeiten, vereine } from "@/db/schema";

// Neuigkeiten/Berichte (Schalter vereine.neuigkeiten_aktiv, siehe lib/neuigkeiten.ts).

export async function neuigkeitenAktiv(vereinId: string): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const v = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { neuigkeitenAktiv: true } });
    return v?.neuigkeitenAktiv ?? false;
  });
}

export type NeuigkeitAdminZeile = {
  id: string;
  titel: string;
  text: string;
  ligaMannschaftId: string | null;
  veroeffentlichtAm: Date | null;
  aktualisiertAm: Date;
};

export async function ladeNeuigkeitenAdmin(vereinId: string): Promise<NeuigkeitAdminZeile[]> {
  return withTenant(vereinId, (tx) =>
    tx
      .select({
        id: neuigkeiten.id,
        titel: neuigkeiten.titel,
        text: neuigkeiten.text,
        ligaMannschaftId: neuigkeiten.ligaMannschaftId,
        veroeffentlichtAm: neuigkeiten.veroeffentlichtAm,
        aktualisiertAm: neuigkeiten.aktualisiertAm,
      })
      .from(neuigkeiten)
      .where(eq(neuigkeiten.vereinId, vereinId))
      .orderBy(desc(neuigkeiten.erstelltAm))
  );
}

// ---- Öffentlich (ohne Anmeldung, über adminDb: der Vereinsfilter steht ausdrücklich in jeder Abfrage) ----

/** Hat der Verein die Neuigkeiten eingeschaltet? Für Reiter, Sitemap und die Seiten (aus = 404). */
export async function neuigkeitenOeffentlichAktiv(vereinId: string): Promise<boolean> {
  const [v] = await mitColdStartRetry(() =>
    adminDb.select({ aktiv: vereine.neuigkeitenAktiv }).from(vereine).where(eq(vereine.id, vereinId))
  );
  return v?.aktiv ?? false;
}

export async function holeVereineMitNeuigkeiten(): Promise<Set<string>> {
  const zeilen = await mitColdStartRetry(() =>
    adminDb.select({ id: vereine.id }).from(vereine).where(eq(vereine.neuigkeitenAktiv, true))
  );
  return new Set(zeilen.map((z) => z.id));
}

export type OeffentlicheNeuigkeit = {
  id: string;
  titel: string;
  text: string;
  datum: Date;
  mannschaft: string | null;
  ligaMannschaftId: string | null;
};

/** Veröffentlichte Neuigkeiten, neueste zuerst; null, wenn der Verein die Funktion nicht eingeschaltet hat. */
export async function holeOeffentlicheNeuigkeiten(vereinId: string, limit = 50): Promise<OeffentlicheNeuigkeit[] | null> {
  if (!(await neuigkeitenOeffentlichAktiv(vereinId))) return null;
  const zeilen = await mitColdStartRetry(() =>
    adminDb
      .select({
        id: neuigkeiten.id,
        titel: neuigkeiten.titel,
        text: neuigkeiten.text,
        datum: neuigkeiten.veroeffentlichtAm,
        ligaMannschaftId: neuigkeiten.ligaMannschaftId,
        name: ligaMannschaften.name,
        eigen: ligaMannschaften.anzeigenameEigen,
      })
      .from(neuigkeiten)
      .leftJoin(ligaMannschaften, eq(ligaMannschaften.id, neuigkeiten.ligaMannschaftId))
      .where(and(eq(neuigkeiten.vereinId, vereinId), isNotNull(neuigkeiten.veroeffentlichtAm), lte(neuigkeiten.veroeffentlichtAm, new Date())))
      .orderBy(desc(neuigkeiten.veroeffentlichtAm))
      .limit(limit)
  );
  return zeilen.map((z) => ({
    id: z.id,
    titel: z.titel,
    text: z.text,
    datum: z.datum!,
    ligaMannschaftId: z.ligaMannschaftId,
    mannschaft: z.ligaMannschaftId ? z.eigen?.trim() || z.name : null,
  }));
}
