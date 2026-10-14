import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { withTenant } from "@/db";
import { dienstArten, dienstArtMannschaften, terminDienstBedarf } from "@/db/schema";
import { bedarfSchluessel, type DienstArtRegel, type EigeneDiensteKontext } from "./eigene-dienste";

// Laden der eigenen Dienste (Regeln rein in eigene-dienste.ts). Immer innerhalb von withTenant aufrufen: die Tabellen haben RLS,
// zusätzlich filtert jede Abfrage ausdrücklich auf den Verein.
type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

export type DienstArtMitDetails = DienstArtRegel & {
  beschreibung: string | null;
  reihenfolge: number;
};

// nurAktive = false für die Einstellungen (dort auch deaktivierte Dienste zeigen).
export async function ladeDienstArten(tx: Tx, vereinId: string, nurAktive = true): Promise<DienstArtMitDetails[]> {
  const arten = await tx
    .select()
    .from(dienstArten)
    .where(nurAktive ? and(eq(dienstArten.vereinId, vereinId), eq(dienstArten.aktiv, true)) : eq(dienstArten.vereinId, vereinId))
    .orderBy(asc(dienstArten.reihenfolge), asc(dienstArten.name));
  if (arten.length === 0) return [];
  const auswahl = await tx
    .select({ dienstArtId: dienstArtMannschaften.dienstArtId, mannschaftId: dienstArtMannschaften.mannschaftId })
    .from(dienstArtMannschaften)
    .where(
      and(
        eq(dienstArtMannschaften.vereinId, vereinId),
        inArray(
          dienstArtMannschaften.dienstArtId,
          arten.map((a) => a.id)
        )
      )
    );
  return arten.map((a) => ({
    id: a.id,
    name: a.name,
    beschreibung: a.beschreibung,
    aktiv: a.aktiv,
    bedarfHeim: a.bedarfHeim,
    bedarfAuswaerts: a.bedarfAuswaerts,
    bedarfFreundschaft: a.bedarfFreundschaft,
    bedarfTurnier: a.bedarfTurnier,
    nurAusgewaehlteMannschaften: a.nurAusgewaehlteMannschaften,
    reihenfolge: a.reihenfolge,
    mannschaftIds: auswahl.filter((m) => m.dienstArtId === a.id).map((m) => m.mannschaftId),
  }));
}

export type EigeneDiensteKontextMitNamen = EigeneDiensteKontext & {
  // Namen ALLER Dienste des Vereins (auch deaktivierter), um bestehende Einteilungen zu beschriften.
  namen: Map<string, string>;
};

// Kontext für die Besetzungs-Berechnungen (Kalender, Übersicht, Offene Dienste) — Bedarf nur aus aktiven Diensten, Overrides der
// übergebenen Termine.
export async function ladeEigeneDiensteKontext(tx: Tx, vereinId: string, terminIds: string[]): Promise<EigeneDiensteKontextMitNamen> {
  const alle = await ladeDienstArten(tx, vereinId, false);
  const arten = alle.filter((a) => a.aktiv);
  const namen = new Map(alle.map((a) => [a.id, a.name]));
  if (arten.length === 0 || terminIds.length === 0) return { arten, overrides: new Map(), namen };
  const zeilen = await tx
    .select({ terminId: terminDienstBedarf.terminId, dienstArtId: terminDienstBedarf.dienstArtId, bedarf: terminDienstBedarf.bedarf })
    .from(terminDienstBedarf)
    .where(and(eq(terminDienstBedarf.vereinId, vereinId), inArray(terminDienstBedarf.terminId, terminIds)));
  return { arten, overrides: new Map(zeilen.map((z) => [bedarfSchluessel(z.terminId, z.dienstArtId), z.bedarf])), namen };
}

// Bezeichnung einer Einteilung für Mails/Anzeige: bei eigenen Diensten der Name des Dienstes (z.B. "Fahrer"), sonst der Typ.
export async function zuordnungsBezeichnung(
  tx: Tx,
  zuordnung: { funktionstraegerTyp: string; dienstArtId: string | null }
): Promise<string> {
  if (zuordnung.funktionstraegerTyp !== "eigener_dienst" || !zuordnung.dienstArtId) return zuordnung.funktionstraegerTyp;
  const [art] = await tx.select({ name: dienstArten.name }).from(dienstArten).where(eq(dienstArten.id, zuordnung.dienstArtId));
  return art?.name ?? zuordnung.funktionstraegerTyp;
}

export async function hatAktiveEigeneDienste(tx: Tx, vereinId: string): Promise<boolean> {
  const [zeile] = await tx
    .select({ id: dienstArten.id })
    .from(dienstArten)
    .where(and(eq(dienstArten.vereinId, vereinId), eq(dienstArten.aktiv, true)))
    .limit(1);
  return !!zeile;
}

// Namen aller eigenen Dienste des Vereins (auch deaktivierter), für die Beschriftung von Einteilungen.
export async function ladeDienstNamen(tx: Tx, vereinId: string): Promise<Map<string, string>> {
  const zeilen = await tx.select({ id: dienstArten.id, name: dienstArten.name }).from(dienstArten).where(eq(dienstArten.vereinId, vereinId));
  return new Map(zeilen.map((z) => [z.id, z.name]));
}
