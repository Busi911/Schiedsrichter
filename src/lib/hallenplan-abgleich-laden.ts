import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaSpiele, ligaTeilnahmen, ligaVereine, termine, vereine } from "@/db/schema";
import { gleicheAb, type AbgleichErgebnis } from "@/lib/hallenplan-abgleich";

export type VereinsAbgleich = {
  vereinId: string;
  vereinName: string;
  hatLigaVerein: boolean;
  termineGesamt: number;
  anzahl: Record<AbgleichErgebnis["status"], number>;
  nurOeffentlich: number; // Liga-Spiele eigener Mannschaften ohne Hallenplan-Termin
  auffaellig: {
    status: AbgleichErgebnis["status"];
    start: Date;
    heim: string | null;
    gast: string | null;
    uid: string | null;
    kandidaten: string[];
  }[];
};

// Nur lesend (adminDb, vereinsübergreifend für den Systemadmin): verändert
// weder Termine noch Zuordnungen. Zeigt, wie viele Hallenplan-Termine sich
// sicher einem Spiel der öffentlichen Liga-Daten zuordnen lassen.
export async function berechneHallenplanAbgleich(): Promise<VereinsAbgleich[]> {
  const alleVereine = await adminDb.select({ id: vereine.id, name: vereine.name }).from(vereine);
  const ergebnis: VereinsAbgleich[] = [];

  for (const v of alleVereine) {
    const hallenTermine = await adminDb
      .select({
        id: termine.id,
        start: termine.start,
        icsUid: termine.icsUid,
        heim: termine.heimMannschaftName,
        gast: termine.auswaertsMannschaftName,
      })
      .from(termine)
      .where(and(eq(termine.vereinId, v.id), eq(termine.typ, "rundenspiel")));

    const [ligaVerein] = await adminDb
      .select({ id: ligaVereine.id })
      .from(ligaVereine)
      .where(eq(ligaVereine.vereinId, v.id));

    let spiele: (typeof ligaSpiele.$inferSelect)[] = [];
    if (ligaVerein) {
      const teilnahmen = await adminDb
        .select({ gruppeId: ligaTeilnahmen.gruppeId, teamtable: ligaTeilnahmen.nuligaTeamtableId })
        .from(ligaTeilnahmen)
        .innerJoin(ligaMannschaften, eq(ligaTeilnahmen.mannschaftId, ligaMannschaften.id))
        .where(and(eq(ligaMannschaften.ligaVereinId, ligaVerein.id), eq(ligaTeilnahmen.aktiv, true)));
      const gruppen = [...new Set(teilnahmen.map((t) => t.gruppeId))];
      const teamIds = teilnahmen.map((t) => t.teamtable).filter((x): x is string => !!x);
      if (gruppen.length > 0 && teamIds.length > 0) {
        spiele = await adminDb
          .select()
          .from(ligaSpiele)
          .where(
            and(
              inArray(ligaSpiele.gruppeId, gruppen),
              or(inArray(ligaSpiele.heimTeamtableId, teamIds), inArray(ligaSpiele.gastTeamtableId, teamIds))
            )
          );
      }
    }

    const abgleich = gleicheAb(
      hallenTermine,
      spiele.map((s) => ({
        id: s.id,
        spielnummer: s.spielnummer,
        datum: s.datum,
        heimName: s.heimName,
        gastName: s.gastName,
      }))
    );
    const anzahl = { sicher: 0, unklar: 0, mehrdeutig: 0, kein_treffer: 0 };
    for (const a of abgleich) anzahl[a.status]++;
    const verknuepft = new Set(abgleich.flatMap((a) => (a.status === "sicher" ? a.spielIds : [])));
    const nurOeffentlich = spiele.filter((s) => !verknuepft.has(s.id)).length;

    const nachId = new Map(hallenTermine.map((t) => [t.id, t]));
    const spielNachId = new Map(spiele.map((s) => [s.id, s]));
    const auffaellig = abgleich
      .filter((a) => a.status !== "sicher")
      .map((a) => {
        const t = nachId.get(a.terminId)!;
        return {
          status: a.status,
          start: t.start,
          heim: t.heim,
          gast: t.gast,
          uid: t.icsUid,
          kandidaten: a.spielIds.map((id) => {
            const s = spielNachId.get(id)!;
            return `${s.datum} ${s.heimName} – ${s.gastName}${s.spielnummer ? ` (Nr. ${s.spielnummer})` : ""}`;
          }),
        };
      })
      .sort((x, y) => x.start.getTime() - y.start.getTime());

    ergebnis.push({
      vereinId: v.id,
      vereinName: v.name,
      hatLigaVerein: !!ligaVerein,
      termineGesamt: hallenTermine.length,
      anzahl,
      nurOeffentlich,
      auffaellig,
    });
  }
  return ergebnis;
}
