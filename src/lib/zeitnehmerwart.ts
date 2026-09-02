import "server-only";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  terminZuordnungen,
  users,
} from "@/db/schema";
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

// Stammdaten der Person für die Einsätze-Detailseite (Klick auf den Namen in
// der Übersicht) — mit eq(users.vereinId, vereinId) abgesichert, damit über
// die userId in der URL nicht Personen anderer Vereine abgefragt werden
// können.
export async function holeZeitnehmerPerson(
  vereinId: string,
  userId: string
): Promise<{ name: string | null; email: string } | null> {
  return withTenant(vereinId, async (tx) => {
    const person = await tx.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.vereinId, vereinId)),
      columns: { name: true, email: true },
    });
    return person ?? null;
  });
}

export type ZeitnehmerPersonEinsatz = {
  terminId: string;
  start: Date;
  typ: string;
  ort: string | null;
  beschreibung: string | null;
  pflichtspiel: boolean | null;
  freundschaftsTyp: "freundschaftsspiel" | "turnier" | null;
  rolle: (typeof ZEITNEHMER_ROLLEN)[number];
  mannschaftName: string | null;
  mannschaftAltersklasse: string | null;
};

// Alle vergangenen Einsätze einer Person als Zeitnehmer/Sekretär im Verein —
// Detailliste zur Zahl in holeZeitnehmerEinsatzZahlen (Klick auf den Namen
// dort). Nur vergangene Termine, analog zur Zählung dort.
export async function holeZeitnehmerEinsaetzeFuerPerson(
  vereinId: string,
  userId: string
): Promise<ZeitnehmerPersonEinsatz[]> {
  return withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .select({
        terminId: termine.id,
        start: termine.start,
        typ: termine.typ,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        pflichtspiel: termine.pflichtspiel,
        freundschaftsTyp: termine.freundschaftsTyp,
        rolle: terminZuordnungen.funktionstraegerTyp,
        mannschaftName: mannschaften.name,
        mannschaftAltersklasse: mannschaften.altersklasse,
      })
      .from(terminZuordnungen)
      .innerJoin(termine, eq(terminZuordnungen.terminId, termine.id))
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .where(
        and(
          eq(termine.vereinId, vereinId),
          eq(terminZuordnungen.userId, userId),
          inArray(terminZuordnungen.funktionstraegerTyp, ZEITNEHMER_ROLLEN),
          lt(termine.start, new Date())
        )
      )
      .orderBy(desc(termine.start));

    return zeilen.map((z) => ({
      ...z,
      rolle: z.rolle as (typeof ZEITNEHMER_ROLLEN)[number],
    }));
  });
}

export type InaktiverZeitnehmerKandidat = {
  rolleId: string;
  userId: string;
  name: string | null;
  email: string;
  typ: (typeof ZEITNEHMER_ROLLEN)[number];
};

// Deaktivierte Zeitnehmer-/Sekretär-Rollen — anders als
// holeZeitnehmerEinsatzZahlen bewusst UNGEMERGT (eine Zeile pro Rolle, nicht
// pro Person), da rolleId zum gezielten (Wieder-)Aktivieren genau dieser
// einen Rolle gebraucht wird (siehe zeitnehmerInaktiveRolleAktivierenUndZuordnen
// in profil/zeitnehmerwart/actions.ts). Grundlage für den Namensabgleich bei
// Selbsteintragungen, die keiner aktiven Person zugeordnet werden konnten —
// oft, weil die Person zwar schon mal angelegt, aber inzwischen deaktiviert
// wurde (z.B. Saisonwechsel).
export async function holeInaktiveZeitnehmerKandidaten(
  vereinId: string
): Promise<InaktiverZeitnehmerKandidat[]> {
  return withTenant(vereinId, async (tx) => {
    const zeilen = await tx
      .select({
        rolleId: funktionstraegerRollen.id,
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
          eq(funktionstraegerRollen.aktiv, false)
        )
      )
      .orderBy(users.name);

    return zeilen.map((z) => ({
      ...z,
      typ: z.typ as (typeof ZEITNEHMER_ROLLEN)[number],
    }));
  });
}
