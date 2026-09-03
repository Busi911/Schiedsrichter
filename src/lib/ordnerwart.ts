import "server-only";
import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { mergeRollenZaehlungen } from "./einsatz-zahlen";

export const ORDNER_ROLLEN = ["ordner", "kioskdienst"] as const;

// Prüft die konfigurierte Bedarfsgrenze (siehe bedarfFuer in dienste.ts),
// BEVOR eine weitere Person eingetragen wird — anders als bei Schiedsrichter/
// Zeitnehmer/Sekretär (siehe pruefeBesetzungsgrenze in zuordnung.ts) gibt es
// hier keine feste Gespann-Obergrenze, die Kapazität IST der Bedarf. Gleiche
// Prüfung wie in ordnerZuordnen (profil/ordnerwart/actions.ts) und
// selbstAnmelden (profil/actions.ts) — hier als geteilte Funktion für die
// öffentliche Selbsteintragung (ordner-eintragen/[token]/actions.ts).
export async function pruefeOrdnerBesetzungsgrenze(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  vereinId: string,
  terminId: string,
  termin: {
    typ: string;
    pflichtspiel: boolean | null;
    freundschaftsTyp: "freundschaftsspiel" | "turnier" | null;
    mannschaftId: string | null;
  },
  rolle: (typeof ORDNER_ROLLEN)[number]
) {
  const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
  if (!verein) throw new Error("Verein nicht gefunden.");

  const mannschaft = termin.mannschaftId
    ? await tx.query.mannschaften.findFirst({ where: eq(mannschaften.id, termin.mannschaftId) })
    : null;
  const bedarf = bedarfFuer(
    verein,
    termin.typ,
    rolle,
    termin.pflichtspiel,
    termin.freundschaftsTyp,
    undefined,
    mannschaftBedarfDeaktiviertFuer(mannschaft, rolle)
  );
  const bestehende = await tx.query.terminZuordnungen.findMany({
    where: and(
      eq(terminZuordnungen.terminId, terminId),
      eq(terminZuordnungen.funktionstraegerTyp, rolle)
    ),
  });
  if (bestehende.length >= bedarf) {
    throw new Error("Für diesen Dienst sind bereits genug Personen eingetragen.");
  }
}

// Verhindert, dass dieselbe Person an einem Termin sowohl als Ordner ALS
// AUCH als Kioskdienst eingeteilt wird (oder zweimal in derselben Rolle) —
// analog zu pruefeKeineDoppelrolle in zuordnung.ts, aber für ORDNER_ROLLEN
// statt zeitnehmer/sekretaer.
export async function pruefeKeineOrdnerDoppelrolle(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  terminId: string,
  person: { userId: string } | { externerName: string }
) {
  const bestehende = await tx.query.terminZuordnungen.findMany({
    where: and(
      eq(terminZuordnungen.terminId, terminId),
      inArray(terminZuordnungen.funktionstraegerTyp, ORDNER_ROLLEN)
    ),
  });
  const doppelt =
    "userId" in person
      ? bestehende.some((z) => z.userId === person.userId)
      : bestehende.some(
          (z) =>
            !z.userId &&
            z.externerName?.trim().toLowerCase() ===
              person.externerName.trim().toLowerCase()
        );
  if (doppelt) {
    throw new Error(
      "Diese Person ist für diesen Termin bereits als Ordner oder Kioskdienst eingetragen."
    );
  }
}

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
            quelle: terminZuordnungen.quelle,
            name: users.name,
            email: users.email,
            externerName: terminZuordnungen.externerName,
            matchVorschlagUserId: terminZuordnungen.matchVorschlagUserId,
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

    const rollenZeilenGetypt = rollenZeilen.map((r) => ({
      ...r,
      typ: r.typ as (typeof ORDNER_ROLLEN)[number],
    }));
    return mergeRollenZaehlungen(rollenZeilenGetypt, zuordnungZaehlung);
  });
}
