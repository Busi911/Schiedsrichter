import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { zahlungsStand } from "./abrechnung";

// Ist der Zugang des Vereins wegen offener Zahlung gesperrt? (Fälligkeit + Karenz überschritten, nicht ausgesetzt, nicht befreit.) Einmal je Anfrage
// gelesen. Fehler beim Lesen sperren NIE (im Zweifel bleibt der Verein nutzbar).
export const istVereinGesperrt = cache(async (vereinId: string): Promise<boolean> => {
  try {
    const v = await withTenant(vereinId, (tx) =>
      tx.query.vereine.findFirst({
        where: eq(vereine.id, vereinId),
        columns: { status: true, tarif: true, zahlungBis: true, zahlungFaelligAm: true, zahlungSperreAus: true },
      })
    );
    return !!v && zahlungsStand(v, new Date()).art === "gesperrt";
  } catch (err) {
    console.error("Prüfung der Zahlungssperre fehlgeschlagen:", err);
    return false;
  }
});
