import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { termine } from "@/db/schema";
import { ermittleSichereVerknuepfungen } from "@/lib/hallenplan-abgleich-laden";
import { schreibeProtokoll } from "@/lib/treuhand";

export type VerknuepfungsErgebnis = {
  verknuepft: number; // neu gesetzt
  bereitsVerknuepft: number; // schon richtig verknüpft (unverändert)
  uebersprungenMehrfach: number; // Spiel wäre Ziel mehrerer Termine (Duplikate) — nicht automatisch
};

// Schritt 2a der Zusammenführung: speichert zu jedem SICHER zugeordneten
// Hallenplan-Termin nur den Verweis auf das öffentliche Spiel
// (termin.liga_spiel_id). Ändert NICHTS sonst — weder Zeit, Ort, Ergebnis,
// Ansetzung noch Zuordnungen — und löscht nichts. Idempotent. Wird ein Spiel
// von mehreren Terminen beansprucht (Duplikate im Hallenplan), bleibt es
// unverknüpft und wird gemeldet statt geraten.
export async function verknuepfeHallenplanTermine(vereinId: string, akteur: string): Promise<VerknuepfungsErgebnis> {
  const sichere = await ermittleSichereVerknuepfungen(vereinId);

  const proSpiel = new Map<string, string[]>();
  for (const p of sichere) proSpiel.set(p.spielId, [...(proSpiel.get(p.spielId) ?? []), p.terminId]);
  const eindeutig = sichere.filter((p) => proSpiel.get(p.spielId)!.length === 1);
  const uebersprungenMehrfach = sichere.length - eindeutig.length;

  const aktuell = eindeutig.length
    ? await adminDb
        .select({ id: termine.id, ligaSpielId: termine.ligaSpielId })
        .from(termine)
        .where(and(eq(termine.vereinId, vereinId), inArray(termine.id, eindeutig.map((p) => p.terminId))))
    : [];
  const aktuellNachId = new Map(aktuell.map((t) => [t.id, t.ligaSpielId]));
  const zuSetzen = eindeutig.filter((p) => aktuellNachId.has(p.terminId) && aktuellNachId.get(p.terminId) !== p.spielId);
  const bereitsVerknuepft = eindeutig.filter((p) => aktuellNachId.get(p.terminId) === p.spielId).length;

  await adminDb.transaction(async (tx) => {
    for (const p of zuSetzen) {
      await tx
        .update(termine)
        .set({ ligaSpielId: p.spielId })
        .where(and(eq(termine.id, p.terminId), eq(termine.vereinId, vereinId)));
    }
  });

  await schreibeProtokoll(
    vereinId,
    "hallenplan_verknuepft",
    akteur,
    `${zuSetzen.length} neu, ${bereitsVerknuepft} bereits verknüpft, ${uebersprungenMehrfach} übersprungen (Duplikate)`
  );
  return { verknuepft: zuSetzen.length, bereitsVerknuepft, uebersprungenMehrfach };
}
