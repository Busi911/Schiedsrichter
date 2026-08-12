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

export type OffenePosten = {
  terminId: string;
  start: Date;
  typ: string;
  ort: string | null;
  luecken: {
    rolle: "ordner" | "kioskdienst" | "zeitnehmer";
    vorhanden: number;
    bedarf: number;
  }[];
};

type VereinBedarf = Parameters<typeof bedarfFuer>[0];
type AnstehenderTermin = {
  id: string;
  start: Date;
  typ: string;
  ort: string | null;
  pflichtspiel?: boolean | null;
  freundschaftsTyp?: "freundschaftsspiel" | "turnier" | null;
};
type Zuordnung = { terminId: string; funktionstraegerTyp: string };

// Nur diese Typen brauchen eine Zeitnehmer-/Sekretär-Zuordnung — deckungsgleich
// mit BESETZUNGSRELEVANTE_TYPEN in den Kalenderansichten (siehe
// src/app/admin/kalender/page.tsx). Der Turnier-Container selbst wird pro
// Einzelspiel (turnier_spiel) besetzt.
const ZEITNEHMER_RELEVANTE_TYPEN = ["spiel_ics", "testspiel", "turnier_spiel", "rundenspiel"];

// Reine Berechnung (ohne DB-Zugriff), damit sie ohne Testdatenbank getestet
// werden kann — siehe src/lib/dashboard.test.ts. Bündelt alle offenen Rollen
// eines Termins (Ordner/Kioskdienst-Bedarf sowie Zeitnehmer/Sekretär) in
// EINEM Eintrag statt separater Zeilen pro Rolle, damit ein einzelner Termin
// mit mehreren offenen Rollen nicht wie mehrere doppelte Termine aussieht.
export function berechneOffenePosten(
  verein: VereinBedarf,
  anstehende: AnstehenderTermin[],
  zuordnungen: Zuordnung[]
): OffenePosten[] {
  const posten: OffenePosten[] = [];

  for (const termin of anstehende) {
    const luecken: OffenePosten["luecken"] = [];

    for (const rolle of ["ordner", "kioskdienst"] as const) {
      const bedarf = bedarfFuer(
        verein,
        termin.typ,
        rolle,
        termin.pflichtspiel,
        termin.freundschaftsTyp
      );
      if (bedarf <= 0) continue;
      const vorhanden = zuordnungen.filter(
        (z) => z.terminId === termin.id && z.funktionstraegerTyp === rolle
      ).length;
      if (vorhanden < bedarf) luecken.push({ rolle, vorhanden, bedarf });
    }

    if (ZEITNEHMER_RELEVANTE_TYPEN.includes(termin.typ)) {
      const vorhanden = zuordnungen.filter(
        (z) =>
          z.terminId === termin.id &&
          (z.funktionstraegerTyp === "zeitnehmer" || z.funktionstraegerTyp === "sekretaer")
      ).length;
      if (vorhanden < 1) luecken.push({ rolle: "zeitnehmer", vorhanden, bedarf: 1 });
    }

    if (luecken.length > 0) {
      posten.push({
        terminId: termin.id,
        start: termin.start,
        typ: termin.typ,
        ort: termin.ort,
        luecken,
      });
    }
  }

  return posten.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export async function holeOffenePosten(vereinId: string): Promise<OffenePosten[]> {
  return withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    if (!verein) return [];

    const anstehende = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        gte(termine.start, new Date()),
        inArray(termine.typ, [
          "spiel_ics",
          "testspiel",
          "turnier",
          "turnier_spiel",
          "rundenspiel",
        ])
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

    return berechneOffenePosten(verein, anstehende, zuordnungen);
  });
}
