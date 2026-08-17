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
import type { EmailInhalt, EmailZeile } from "@/lib/email-layout";
import { appUrl } from "@/lib/app-url";

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
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

// Gemeinsam genutzt vom Kalender-Modal (admin/zuordnung/actions.ts, siehe
// monats-kalender.tsx) und den Wart-Rollen (/profil/schiedsrichterwart,
// /profil/zeitnehmerwart, /profil/ordnerwart) — alle benachrichtigen die
// zugeordnete Person per Mail im selben Format. Liegt hier statt in einer
// der "use server"-Action-Dateien, da deren Exporte ausschließlich async
// Server Actions sein dürfen.
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

// Analog zu zuordnungsMailInhalt oben, aber für mehrere Termine auf einmal
// (siehe zeitnehmerSelbstEintragenMehrfachOeffentlich in
// zeitnehmer-eintragen/[token]/actions.ts) — EINE Mail mit einer Zeile pro
// Termin statt einer Einzelmail je Termin, damit jemand, der sich für ein
// ganzes Turnierwochenende einträgt, nicht mit vielen Mails auf einmal
// bombardiert wird.
export function mehrfachZuordnungsMailInhalt(
  rolle: string,
  termine: { start: Date; ort: string | null; beschreibung: string | null }[]
) {
  const rolleLabel = ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle;
  // Ein flacher "Datum · Ort · Beschreibung"-Fließtext pro Termin lief bei
  // mehreren Terminen optisch ineinander (kaum unterscheidbar, siehe
  // Screenshot-Feedback) — deshalb hier: Datum als fette, eigene Zeile (der
  // visuelle Anker pro Termin), Ort/Beschreibung darunter, und ab dem
  // zweiten Termin ein zusätzlicher Abstand nach oben, damit jeder Termin
  // klar als eigener Block erkennbar ist.
  const zeilen: EmailZeile[] = termine.flatMap((t, i) => {
    const eintrag: EmailZeile[] = [
      { text: formatDatumZeitLang(t.start), stark: true, neueGruppe: i > 0 },
    ];
    const details = [t.ort, t.beschreibung].filter(Boolean).join(" · ");
    if (details) eintrag.push(details);
    return eintrag;
  });
  return {
    ueberschrift:
      termine.length === 1
        ? `Du wurdest als ${rolleLabel} eingeteilt.`
        : `Du wurdest als ${rolleLabel} für ${termine.length} Termine eingeteilt.`,
    zeilen,
  };
}

// Benachrichtigt den Zeitnehmerwart, wenn eine öffentliche Selbsteintragung
// (siehe zeitnehmerSelbstEintragenMehrfachOeffentlich in
// zeitnehmer-eintragen/[token]/actions.ts) für mindestens einen Termin
// fehlschlägt (z.B. bereits voll besetzt oder die Person ist für diesen
// Termin schon eingetragen) — die Person selbst sieht zwar eine
// Fehlermeldung auf der Seite, meldet sich deswegen aber nicht zwangsläufig
// beim Wart, und ohne diese Mail bliebe die Lücke sonst unbemerkt.
export function zuordnungFehlgeschlagenInhalt(
  name: string,
  rolle: string,
  fehler: string[]
): EmailInhalt {
  const rolleLabel = ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle;
  return {
    ueberschrift:
      fehler.length === 1
        ? `Selbsteintragung von ${name} als ${rolleLabel} war bei einem Termin nicht möglich.`
        : `Selbsteintragung von ${name} als ${rolleLabel} war bei ${fehler.length} Terminen nicht möglich.`,
    zeilen: fehler,
    cta: {
      text: "Zur Zeitnehmer-Übersicht",
      url: `${appUrl()}/profil/zeitnehmerwart`,
    },
  };
}

// Prüft die Gespann-/Zweierbesetzung-Obergrenze, BEVOR eine weitere Person
// eingetragen wird — schiedsrichter max. SCHIRI_GESPANN_MAX (fest 2),
// zeitnehmer+sekretaer zusammen max. vereine.zeitnehmerSekretaerMax
// (konfigurierbar, siehe /admin/einstellungen). Wirft, wenn die Grenze für
// `rolle` bereits erreicht ist. Gemeinsam genutzt vom Kalender-Modal und
// den Wart-Rollen /profil/schiedsrichterwart und /profil/zeitnehmerwart —
// liegt hier statt in einer der "use server"-Action-Dateien, da deren
// Exporte ausschließlich async Server Actions mit serialisierbaren
// Parametern sein dürfen (tx ist das nicht).
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

// Verhindert, dass dieselbe Person an einem Termin sowohl als Zeitnehmer ALS
// AUCH als Sekretär eingeteilt wird (oder zweimal in derselben Rolle) — die
// öffentliche Selbsteintragung (siehe zeitnehmer-eintragen/[token]/
// actions.ts) hat sonst keine Sperre gegen versehentliche Doppel-/
// Mehrfacheintragung. Identifiziert die Person über userId (bekannter
// Account) oder, mangels stabiler Identität, über exakt gleichen
// externerName (Person ohne Login) — Groß-/Kleinschreibung und
// umgebende Leerzeichen werden dabei ignoriert.
export async function pruefeKeineDoppelrolle(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  terminId: string,
  person: { userId: string } | { externerName: string }
) {
  const bestehende = await tx.query.terminZuordnungen.findMany({
    where: and(
      eq(terminZuordnungen.terminId, terminId),
      inArray(terminZuordnungen.funktionstraegerTyp, ["zeitnehmer", "sekretaer"])
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
      "Diese Person ist für diesen Termin bereits als Zeitnehmer oder Sekretär eingetragen."
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
            matchVorschlagUserId: terminZuordnungen.matchVorschlagUserId,
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
