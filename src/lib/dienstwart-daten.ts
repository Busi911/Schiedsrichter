import "server-only";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { dienstwartStellen, type DienstwartStelle, type EingeteiltePerson } from "./eigene-dienste";
import { ladeDienstArten, ladeEigeneDiensteKontext } from "./eigene-dienste-daten";
import { formatMannschaft } from "./mannschaft-label";

// Daten für /profil/dienstwart: künftige Termine mit eigenen Diensten, die Einteilungen und alle Personen des Vereins als Auswahl.
// Eigene Dienste haben keine Rollen: eingeteilt werden kann jede Person des Vereins (oder ein freier Name ohne Login).

export type DienstwartTermin = {
  id: string;
  start: Date;
  typ: string;
  pflichtspiel: boolean | null;
  freundschaftsTyp: "freundschaftsspiel" | "turnier" | null;
  ort: string | null;
  beschreibung: string | null;
  mannschaftId: string | null;
  mannschaftLabel: string | null;
  stellen: DienstwartStelle[];
};

// Für eigene Dienste relevante Termintypen (siehe veranstaltungsArt in eigene-dienste.ts).
const TYPEN = ["testspiel", "turnier", "rundenspiel", "auswaertsspiel"] as const;

export async function holeDienstwartDaten(vereinId: string) {
  return withTenant(vereinId, async (tx) => {
    const alleArten = await ladeDienstArten(tx, vereinId, false);
    const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId), columns: { diensteSelbstanmeldungToken: true } });
    const selbstanmeldungToken = verein?.diensteSelbstanmeldungToken ?? null;
    const personen = await tx
      .select({ userId: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.vereinId, vereinId))
      .orderBy(asc(users.name), asc(users.email));
    if (alleArten.length === 0) {
      return { alleArten, termine: [] as DienstwartTermin[], personen, mannschaftsListe: [], selbstanmeldungToken };
    }

    const kommende = await tx
      .select({
        id: termine.id,
        start: termine.start,
        typ: termine.typ,
        pflichtspiel: termine.pflichtspiel,
        freundschaftsTyp: termine.freundschaftsTyp,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        mannschaftId: termine.mannschaftId,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
        kategorie: termine.kategorie,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(and(eq(termine.vereinId, vereinId), gte(termine.start, new Date()), inArray(termine.typ, TYPEN)))
      .orderBy(asc(termine.start));
    const terminIds = kommende.map((t) => t.id);

    const [kontext, zuordnungen, mannschaftsListe] = await Promise.all([
      ladeEigeneDiensteKontext(tx, vereinId, terminIds),
      terminIds.length
        ? tx
            .select({
              zuordnungId: terminZuordnungen.id,
              terminId: terminZuordnungen.terminId,
              dienstArtId: terminZuordnungen.dienstArtId,
              userId: terminZuordnungen.userId,
              externerName: terminZuordnungen.externerName,
              abmeldungAngefragtAm: terminZuordnungen.abmeldungAngefragtAm,
              name: users.name,
              email: users.email,
            })
            .from(terminZuordnungen)
            .leftJoin(users, eq(terminZuordnungen.userId, users.id))
            .where(and(inArray(terminZuordnungen.terminId, terminIds), eq(terminZuordnungen.funktionstraegerTyp, "eigener_dienst")))
        : Promise.resolve([]),
      tx
        .select({ id: mannschaften.id, name: mannschaften.name, altersklasse: mannschaften.altersklasse })
        .from(mannschaften)
        .where(eq(mannschaften.vereinId, vereinId)),
    ]);

    const eingeteilt: EingeteiltePerson[] = zuordnungen.map((z) => ({
      zuordnungId: z.zuordnungId,
      terminId: z.terminId,
      dienstArtId: z.dienstArtId,
      userId: z.userId,
      anzeigeName: z.name ?? z.externerName ?? z.email ?? "Unbekannt",
      ohneLogin: !z.userId,
      abmeldungAngefragt: !!z.abmeldungAngefragtAm,
    }));

    const liste: DienstwartTermin[] = [];
    for (const t of kommende) {
      const stellen = dienstwartStellen(kontext, alleArten, t, eingeteilt);
      if (stellen.length === 0) continue;
      liste.push({
        id: t.id,
        start: t.start,
        typ: t.typ,
        pflichtspiel: t.pflichtspiel,
        freundschaftsTyp: t.freundschaftsTyp,
        ort: t.ort,
        beschreibung: t.beschreibung,
        mannschaftId: t.mannschaftId,
        mannschaftLabel: formatMannschaft(t),
        stellen,
      });
    }
    const genutzteMannschaften = new Set(liste.map((t) => t.mannschaftId).filter(Boolean));
    return {
      alleArten,
      termine: liste,
      personen,
      mannschaftsListe: mannschaftsListe.filter((m) => genutzteMannschaften.has(m.id)),
      selbstanmeldungToken,
    };
  });
}
