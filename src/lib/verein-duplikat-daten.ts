import "server-only";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { vereinKontakt, vereine } from "@/db/schema";
import { istAehnlicherName, type VereinZustand } from "./verein-duplikat";

export type AehnlicherVerein = { id: string; name: string; zustand: VereinZustand };

// Alle schon angelegten Vereine (ohne den Demo-Verein) mit ähnlichem Namen. Nur für die Systemadmins und die Rückfrage an die Person
// gedacht: der gespeicherte Name und Zustand werden NICHT an anonyme Besucher ausgegeben.
export async function findeAehnlicheVereine(name: string): Promise<AehnlicherVerein[]> {
  const alle = await adminDb
    .select({ id: vereine.id, name: vereine.name, status: vereine.status, inaktivSeit: vereinKontakt.inaktivSeit })
    .from(vereine)
    .leftJoin(vereinKontakt, eq(vereinKontakt.vereinId, vereine.id))
    .where(eq(vereine.istDemo, false));
  return alle
    .filter((v) => istAehnlicherName(name, v.name))
    .map((v) => ({
      id: v.id,
      name: v.name,
      zustand: v.status === "aktiv" ? "aktiv" : v.inaktivSeit ? "inaktiv" : "vorbereitung",
    }));
}
