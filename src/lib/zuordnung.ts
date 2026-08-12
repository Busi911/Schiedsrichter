import "server-only";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  termine,
  terminZuordnungen,
  users,
} from "@/db/schema";
import { formatDatumZeitLang } from "@/lib/format";

// Rollen, die einem Termin über termin_zuordnung zugeordnet werden können.
// 'trainer' hängt an der Mannschaft (nicht am einzelnen Termin), 'ordner'
// und 'kioskdienst' melden sich selbst an (siehe src/app/profil/actions.ts).
export const ZUORDENBARE_TYPEN = [
  "schiedsrichter",
  "zeitnehmer",
  "sekretaer",
] as const;

const ZUORDNUNGS_ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

// Gemeinsam genutzt von /admin/zuordnung (Admin) und
// /profil/schiedsrichterwart (Schiedsrichterwart-Rolle) — beide
// benachrichtigen die zugeordnete Person per Mail im selben Format. Liegt
// hier statt in einer der beiden "use server"-Action-Dateien, da deren
// Exporte ausschließlich async Server Actions sein dürfen.
export function zuordnungsMailInhalt(
  rolle: string,
  termin: { start: Date; ort: string | null; beschreibung: string | null }
) {
  const zeitpunkt = formatDatumZeitLang(termin.start);
  const zeilen: string[] = [`Termin: ${zeitpunkt}`];
  if (termin.ort) zeilen.push(`Ort: ${termin.ort}`);
  if (termin.beschreibung) zeilen.push(termin.beschreibung);
  return {
    ueberschrift: `Du wurdest als ${ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle} eingeteilt.`,
    zeilen,
  };
}

export async function holeTermineMitZuordnungen(vereinId: string) {
  return withTenant(vereinId, async (tx) => {
    const terminListe = await tx.query.termine.findMany({
      // Der Turnier-Container selbst ist kein Zuordnungsziel — zugeordnet
      // wird pro Einzelspiel (typ "turnier_spiel").
      where: and(
        eq(termine.vereinId, vereinId),
        gte(termine.start, new Date()),
        ne(termine.typ, "turnier")
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
            // LEFT JOIN statt innerJoin: Zuordnungen ohne Account
            // (externerName gesetzt, userId null) müssen erhalten bleiben.
            name: users.name,
            email: users.email,
            externerName: terminZuordnungen.externerName,
          })
          .from(terminZuordnungen)
          .leftJoin(users, eq(terminZuordnungen.userId, users.id))
          .where(inArray(terminZuordnungen.terminId, terminIds))
      : [];

    const icsSchiedsrichterIds = [
      ...new Set(
        terminListe
          .map((t) => t.icsSchiedsrichterId)
          .filter((id): id is string => !!id)
      ),
    ];
    const icsSchiedsrichter = icsSchiedsrichterIds.length
      ? await tx
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, icsSchiedsrichterIds))
      : [];

    return terminListe.map((termin) => ({
      ...termin,
      zuordnungen: zuordnungen.filter((z) => z.terminId === termin.id),
      icsSchiedsrichter: icsSchiedsrichter.find(
        (s) => s.id === termin.icsSchiedsrichterId
      ),
    }));
  });
}

export async function holeZuordenbareFunktionstraeger(vereinId: string) {
  return withTenant(vereinId, (tx) =>
    tx
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
          inArray(funktionstraegerRollen.typ, [...ZUORDENBARE_TYPEN]),
          eq(funktionstraegerRollen.aktiv, true)
        )
      )
      .orderBy(asc(users.name))
  );
}
