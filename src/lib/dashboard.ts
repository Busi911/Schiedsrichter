import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, vereine } from "@/db/schema";
import { bedarfFuer } from "./dienste";

export async function holeNaechsteTermine(vereinId: string, limit = 5) {
  return withTenant(vereinId, (tx) =>
    tx.query.termine.findMany({
      where: and(eq(termine.vereinId, vereinId), gte(termine.start, new Date())),
      orderBy: (t, { asc }) => [asc(t.start)],
      limit,
    })
  );
}

export type UnbesetzterDienst = {
  terminId: string;
  start: Date;
  typ: string;
  ort: string | null;
  rolle: "ordner" | "kioskdienst";
  vorhanden: number;
  bedarf: number;
};

type VereinBedarf = Parameters<typeof bedarfFuer>[0];
type AnstehenderTermin = {
  id: string;
  start: Date;
  typ: string;
  ort: string | null;
};
type Zuordnung = { terminId: string; funktionstraegerTyp: string };

// Reine Berechnung (ohne DB-Zugriff), damit sie ohne Testdatenbank
// getestet werden kann — siehe src/lib/dashboard.test.ts.
export function berechneUnbesetzteDienste(
  verein: VereinBedarf,
  anstehende: AnstehenderTermin[],
  zuordnungen: Zuordnung[]
): UnbesetzterDienst[] {
  const luecken: UnbesetzterDienst[] = [];
  for (const termin of anstehende) {
    for (const rolle of ["ordner", "kioskdienst"] as const) {
      const bedarf = bedarfFuer(verein, termin.typ, rolle);
      if (bedarf <= 0) continue;
      const vorhanden = zuordnungen.filter(
        (z) => z.terminId === termin.id && z.funktionstraegerTyp === rolle
      ).length;
      if (vorhanden < bedarf) {
        luecken.push({
          terminId: termin.id,
          start: termin.start,
          typ: termin.typ,
          ort: termin.ort,
          rolle,
          vorhanden,
          bedarf,
        });
      }
    }
  }

  return luecken.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function holeUnbesetzteDienste(
  vereinId: string
): Promise<UnbesetzterDienst[]> {
  return withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    if (!verein) return [];

    const anstehende = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        gte(termine.start, new Date()),
        inArray(termine.typ, ["testspiel", "turnier"])
      ),
      orderBy: (t, { asc }) => [asc(t.start)],
    });
    if (anstehende.length === 0) return [];

    const terminIds = anstehende.map((t) => t.id);
    const zuordnungen = await tx
      .select({
        terminId: terminZuordnungen.terminId,
        funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
      })
      .from(terminZuordnungen)
      .where(inArray(terminZuordnungen.terminId, terminIds));

    return berechneUnbesetzteDienste(verein, anstehende, zuordnungen);
  });
}
