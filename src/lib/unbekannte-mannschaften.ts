import "server-only";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { ignorierteMannschaften, termine } from "@/db/schema";
import { gruppiereUnbekannteMannschaften, type UnbekannteMannschaft } from "./rundenspiel-import";

export type IgnorierteMannschaftEintrag = typeof ignorierteMannschaften.$inferSelect;

export type UnbekannteMannschaftenErgebnis = {
  unbekannteMannschaften: UnbekannteMannschaft[];
  ignoriert: IgnorierteMannschaftEintrag[];
};

// Für /admin/mannschaften (dort gehört die Mannschaftsverwaltung inhaltlich
// hin, siehe "Unbekannte Mannschaften"/"Abgelehnte Mannschaften" dort) —
// eigene, schlanke Abfrage statt der vollständigen Rundenspiel-Liste, die
// /admin/termine für die dortige Spiel-Tabelle ohnehin schon lädt.
export async function holeUnbekannteMannschaften(
  vereinId: string
): Promise<UnbekannteMannschaftenErgebnis> {
  return withTenant(vereinId, async (tx) => {
    const [rundenspiele, ignoriert] = await Promise.all([
      tx
        .select({
          heimMannschaftName: termine.heimMannschaftName,
          mannschaftId: termine.mannschaftId,
          kategorie: termine.kategorie,
        })
        .from(termine)
        .where(and(eq(termine.vereinId, vereinId), eq(termine.typ, "rundenspiel"))),
      tx.query.ignorierteMannschaften.findMany({
        where: eq(ignorierteMannschaften.vereinId, vereinId),
      }),
    ]);

    const ignoriertSet = new Set(
      ignoriert.map((i) => `${i.normalisierterName}::${i.kategorie ?? ""}`)
    );
    const unbekannteMannschaften = gruppiereUnbekannteMannschaften(rundenspiele).filter(
      (m) => !ignoriertSet.has(`${m.normalisiert}::${m.kategorie ?? ""}`)
    );

    return { unbekannteMannschaften, ignoriert };
  });
}
