import "server-only";
import { cache } from "react";
import { and, eq, gte, inArray } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { hallen, ligaMannschaften, mannschaften, trainingAusfaelle, trainingszeiten, vereine } from "@/db/schema";
import { berlinJetzt } from "./training-ausfall";
import { baueOeffentlicheTrainings, type OeffentlichesTraining } from "./training-oeffentlich";

const TAGE = 14;

// Hat der Verein den Reiter "Training" in der öffentlichen App eingeschaltet (vereine.training_oeffentlich, Einstellungen → Training)? Gelesen über adminDb (öffentliche Seite, keine
// Anmeldung); je Anfrage einmal.
export const trainingOeffentlichAktiv = cache(async (vereinId: string): Promise<boolean> => {
  const [v] = await adminDb.select({ an: vereine.trainingOeffentlich }).from(vereine).where(eq(vereine.id, vereinId));
  return !!v?.an;
});

// Für die Sitemap: alle Vereine mit eingeschaltetem öffentlichem Training (eine Abfrage).
export async function holeVereineMitOeffentlichemTraining(): Promise<Set<string>> {
  const zeilen = await adminDb.select({ id: vereine.id }).from(vereine).where(eq(vereine.trainingOeffentlich, true));
  return new Set(zeilen.map((z) => z.id));
}

// Trainings der nächsten zwei Wochen für die öffentliche Seite (null, wenn der Verein den Reiter nicht eingeschaltet hat). Alle Abfragen mit ausdrücklichem Vereinsfilter ("verein_id",
// adminDb umgeht die Mandanten-Sicherung); die Aufbereitung ist eine Whitelist (lib/training-oeffentlich.ts).
export async function holeOeffentlicheTrainings(vereinId: string): Promise<OeffentlichesTraining[] | null> {
  if (!(await trainingOeffentlichAktiv(vereinId))) return null;
  const jetzt = new Date();
  const heute = berlinJetzt(jetzt).datum;
  const [zeiten, ausfaelle, mannschaftenListe, hallenListe] = await Promise.all([
    adminDb.select().from(trainingszeiten).where(eq(trainingszeiten.vereinId, vereinId)),
    adminDb
      .select({ trainingszeitId: trainingAusfaelle.trainingszeitId, datum: trainingAusfaelle.datum, grund: trainingAusfaelle.grund })
      .from(trainingAusfaelle)
      .where(and(eq(trainingAusfaelle.vereinId, vereinId), gte(trainingAusfaelle.datum, heute))),
    adminDb
      .select({ id: mannschaften.id, name: mannschaften.name, altersklasse: mannschaften.altersklasse, ligaMannschaftId: mannschaften.ligaMannschaftId })
      .from(mannschaften)
      .where(eq(mannschaften.vereinId, vereinId)),
    adminDb.select().from(hallen).where(eq(hallen.vereinId, vereinId)),
  ]);
  const ligaIds = mannschaftenListe.flatMap((m) => (m.ligaMannschaftId ? [m.ligaMannschaftId] : []));
  const ligaZeilen = ligaIds.length
    ? await adminDb.select({ id: ligaMannschaften.id, kategorie: ligaMannschaften.kategorie }).from(ligaMannschaften).where(inArray(ligaMannschaften.id, ligaIds))
    : [];
  return baueOeffentlicheTrainings({
    zeiten,
    ausfaelle,
    mannschaften: mannschaftenListe,
    hallen: hallenListe,
    ligaKategorien: new Map(ligaZeilen.map((l) => [l.id, l.kategorie])),
    jetzt,
    tage: TAGE,
  });
}
