import "server-only";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { formatDatumZeitLang } from "@/lib/format";
import { SCHIRI_GESPANN_MAX, berechneBesetzung } from "@/lib/besetzung";

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

// Prüft die Gespann-/Zweierbesetzung-Obergrenze, BEVOR eine weitere Person
// eingetragen wird — schiedsrichter max. SCHIRI_GESPANN_MAX (fest 2),
// zeitnehmer+sekretaer zusammen max. vereine.zeitnehmerSekretaerMax
// (konfigurierbar, siehe /admin/einstellungen). Wirft, wenn die Grenze für
// `rolle` bereits erreicht ist. Gemeinsam genutzt von /admin/zuordnung und
// /profil/schiedsrichterwart — liegt hier statt in einer der beiden "use
// server"-Action-Dateien, da deren Exporte ausschließlich async Server
// Actions mit serialisierbaren Parametern sein dürfen (tx ist das nicht).
export async function pruefeBesetzungsgrenze(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  vereinId: string,
  terminId: string,
  rolle: (typeof ZUORDENBARE_TYPEN)[number]
) {
  const [bestehende, verein] = await Promise.all([
    tx.query.terminZuordnungen.findMany({
      where: eq(terminZuordnungen.terminId, terminId),
    }),
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) }),
  ]);
  const zeitnehmerSekretaerMax = verein?.zeitnehmerSekretaerMax;
  const status = berechneBesetzung(bestehende, false, undefined, zeitnehmerSekretaerMax);
  if (rolle === "schiedsrichter" && status.schiriVoll) {
    throw new Error(
      `Es sind bereits ${SCHIRI_GESPANN_MAX} Schiedsrichter (Gespann-Maximum) zugeordnet.`
    );
  }
  if (
    (rolle === "zeitnehmer" || rolle === "sekretaer") &&
    status.zeitnehmerSekretaerVoll
  ) {
    throw new Error(
      `Es sind bereits ${zeitnehmerSekretaerMax} Zeitnehmer/Sekretäre zugeordnet.`
    );
  }
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
