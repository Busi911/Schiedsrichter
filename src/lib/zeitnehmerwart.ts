import "server-only";
import { and, count, eq, inArray, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen, users } from "@/db/schema";
import { mergeRollenZaehlungen } from "./einsatz-zahlen";

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;

// Eigene Funktionsträger-Rolle, unabhängig von istAdmin und einer eigenen
// "zeitnehmer"/"sekretaer"-Rolle derselben Person — siehe Kommentar bei
// istSchiedsrichterwart in schiedsrichterwart.ts, gilt hier analog.
export async function istZeitnehmerwart(
  vereinId: string,
  userId: string
): Promise<boolean> {
  return withTenant(vereinId, async (tx) => {
    const rolle = await tx.query.funktionstraegerRollen.findFirst({
      where: and(
        eq(funktionstraegerRollen.userId, userId),
        eq(funktionstraegerRollen.typ, "zeitnehmerwart"),
        eq(funktionstraegerRollen.aktiv, true)
      ),
    });
    return !!rolle;
  });
}

export type ZeitnehmerEinsatzZahl = {
  userId: string;
  name: string | null;
  email: string;
  anzahlEinsaetze: number;
  // WELCHE der beiden Rollen die Person tatsächlich hält — eine Person mit
  // nur "zeitnehmer" darf nicht als "sekretaer" zugeordnet werden können,
  // auch wenn beide Rollen gemeinsam als EIN Wart-Bereich verwaltet werden.
  rollen: (typeof ZEITNEHMER_ROLLEN)[number][];
};

// Zeitnehmer und Sekretär zusammen (siehe berechneBesetzung in
// besetzung.ts, wo beide Rollen ebenfalls gemeinsam gezählt werden) — eine
// Person mit BEIDEN Rollen taucht nur einmal auf, mit der Summe ihrer
// Einsätze in beiden Rollen.
export async function holeZeitnehmerEinsatzZahlen(
  vereinId: string
): Promise<ZeitnehmerEinsatzZahl[]> {
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
          inArray(funktionstraegerRollen.typ, ZEITNEHMER_ROLLEN),
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
          inArray(terminZuordnungen.funktionstraegerTyp, ZEITNEHMER_ROLLEN),
          lt(termine.start, jetzt)
        )
      )
      .groupBy(terminZuordnungen.userId);

    const rollenZeilenGetypt = rollenZeilen.map((r) => ({
      ...r,
      typ: r.typ as (typeof ZEITNEHMER_ROLLEN)[number],
    }));
    return mergeRollenZaehlungen(rollenZeilenGetypt, zuordnungZaehlung);
  });
}
