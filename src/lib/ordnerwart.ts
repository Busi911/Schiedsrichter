import "server-only";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen, users } from "@/db/schema";

export const ORDNER_ROLLEN = ["ordner", "kioskdienst"] as const;

// Ordner-/Kioskdienst-Bedarf gilt für testspiel/turnier/rundenspiel — beim
// Turnier für den CONTAINER selbst (typ = turnier), nicht pro Einzelspiel
// (siehe bedarfFuer in dienste.ts). Deshalb eigene Abfrage statt
// holeTermineMitZuordnungen in zuordnung.ts, die den Turnier-Container
// bewusst ausschließt (dort geht es um Schiedsrichter/Zeitnehmer/Sekretär,
// die pro Einzelspiel/turnier_spiel zugeordnet werden).
export async function holeOrdnerRelevanteTermine(vereinId: string) {
  return withTenant(vereinId, async (tx) => {
    const terminListe = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        gte(termine.start, new Date()),
        inArray(termine.typ, ["testspiel", "turnier", "rundenspiel"])
      ),
      orderBy: (t, { asc }) => [asc(t.start)],
    });

    const terminIds = terminListe.map((t) => t.id);
    const zuordnungen = terminIds.length
      ? await tx
          .select({
            id: terminZuordnungen.id,
            terminId: terminZuordnungen.terminId,
            userId: terminZuordnungen.userId,
            funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
            name: users.name,
            email: users.email,
            externerName: terminZuordnungen.externerName,
          })
          .from(terminZuordnungen)
          .leftJoin(users, eq(terminZuordnungen.userId, users.id))
          .where(inArray(terminZuordnungen.terminId, terminIds))
      : [];

    return terminListe.map((termin) => ({
      ...termin,
      zuordnungen: zuordnungen.filter((z) => z.terminId === termin.id),
    }));
  });
}

// Eigene Funktionsträger-Rolle, unabhängig von istAdmin und einer eigenen
// "ordner"/"kioskdienst"-Rolle derselben Person — siehe Kommentar bei
// istSchiedsrichterwart in schiedsrichterwart.ts, gilt hier analog.
export async function istOrdnerwart(
  vereinId: string,
  userId: string
): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const rolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, userId),
        eq(funktionstraegerRollen.typ, "ordnerwart"),
        eq(funktionstraegerRollen.aktiv, true)
      ),
    });
    return !!rolle;
  });
}

export type OrdnerEinsatzZahl = {
  userId: string;
  name: string | null;
  email: string;
  anzahlEinsaetze: number;
  // WELCHE der beiden Rollen die Person tatsächlich hält — eine Person mit
  // nur "ordner" darf nicht als "kioskdienst" zugeordnet werden können,
  // auch wenn beide Rollen gemeinsam als EIN Wart-Bereich verwaltet werden.
  rollen: (typeof ORDNER_ROLLEN)[number][];
};

// Ordner und Kioskdienst zusammen — eine Person mit BEIDEN Rollen taucht
// nur einmal auf, mit der Summe ihrer Einsätze in beiden Rollen.
export async function holeOrdnerEinsatzZahlen(
  vereinId: string
): Promise<OrdnerEinsatzZahl[]> {
  return withTenant(vereinId, async (tx) => {
    const rollenZeilen = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        typ: funktionstraegerRollen.typ,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .where(
        and(
          inArray(funktionstraegerRollen.typ, ORDNER_ROLLEN),
          eq(funktionstraegerRollen.aktiv, true)
        )
      )
      .orderBy(users.name);

    const jetzt = new Date();

    const zuordnungZaehlung = await tx
      .select({ userId: terminZuordnungen.userId, anzahl: count() })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(terminZuordnungen.terminId, termine.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          inArray(terminZuordnungen.funktionstraegerTyp, ORDNER_ROLLEN),
          lt(termine.start, jetzt)
        )
      )
      .groupBy(terminZuordnungen.userId);

    const personenMap = new Map<string, OrdnerEinsatzZahl>();
    for (const r of rollenZeilen) {
      const eintrag = personenMap.get(r.userId) ?? {
        userId: r.userId,
        name: r.name,
        email: r.email,
        anzahlEinsaetze: Number(
          zuordnungZaehlung.find((z) => z.userId === r.userId)?.anzahl ?? 0
        ),
        rollen: [],
      };
      eintrag.rollen.push(r.typ as (typeof ORDNER_ROLLEN)[number]);
      personenMap.set(r.userId, eintrag);
    }
    return Array.from(personenMap.values());
  });
}
