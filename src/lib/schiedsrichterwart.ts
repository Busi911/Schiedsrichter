import "server-only";
import { and, count, eq, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen, users } from "@/db/schema";
import { summiereZweiZaehlungen } from "./einsatz-zahlen";

// Eigene Funktionsträger-Rolle, unabhängig von istAdmin und einer eigenen
// "schiedsrichter"-Rolle derselben Person — eine Person kann gleichzeitig
// Schiedsrichter, Schiedsrichterwart und/oder (System-)Admin sein (siehe
// /profil, wo diese Übersicht entsprechend zusätzlich zu den anderen
// rollenabhängigen Karten erscheint, nicht anstelle von ihnen).
export async function istSchiedsrichterwart(
  vereinId: string,
  userId: string
): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const rolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, userId),
        eq(funktionstraegerRollen.typ, "schiedsrichterwart"),
        eq(funktionstraegerRollen.aktiv, true)
      ),
    });
    return !!rolle;
  });
}

export type SchiedsrichterEinsatzZahl = {
  userId: string;
  name: string | null;
  email: string;
  anzahlEinsaetze: number;
};

// Zählt bereits absolvierte (vergangene) Einsätze eines Schiedsrichters —
// sowohl über die persönliche ICS-Feed-Zuordnung (typ = spiel_ics,
// icsSchiedsrichterId) als auch über termin_zuordnung mit
// funktionstraegerTyp = 'schiedsrichter' (Freundschaftsspiele, Turniere,
// Rundenspiele ohne Verbands-Schiri) — siehe Kommentar in besetzung.ts zur
// Unterscheidung, wann welcher Weg zutrifft.
export async function holeSchiedsrichterEinsatzZahlen(
  vereinId: string
): Promise<SchiedsrichterEinsatzZahl[]> {
  return withTenant(vereinId, async (tx) => {
    const schiedsrichterListe = await tx
      .select({ userId: users.id, name: users.name, email: users.email })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          eq(funktionstraegerRollen.typ, "schiedsrichter"),
          eq(funktionstraegerRollen.aktiv, true)
        )
      )
      .orderBy(users.name);

    const jetzt = new Date();

    const icsZaehlung = await tx
      .select({ userId: termine.icsSchiedsrichterId, anzahl: count() })
      .from(termine)
      .where(
        and(
          eq(termine.vereinId, vereinId),
          eq(termine.typ, "spiel_ics"),
          lt(termine.start, jetzt)
        )
      )
      .groupBy(termine.icsSchiedsrichterId);

    const zuordnungZaehlung = await tx
      .select({ userId: terminZuordnungen.userId, anzahl: count() })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(terminZuordnungen.terminId, termine.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          eq(terminZuordnungen.funktionstraegerTyp, "schiedsrichter"),
          lt(termine.start, jetzt)
        )
      )
      .groupBy(terminZuordnungen.userId);

    return summiereZweiZaehlungen(schiedsrichterListe, icsZaehlung, zuordnungZaehlung);
  });
}
