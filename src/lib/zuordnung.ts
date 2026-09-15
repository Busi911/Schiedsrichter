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
import { SCHIRI_GESPANN_MAX, berechneBesetzung } from "@/lib/besetzung";
import type { EmailInhalt, EmailZeile } from "@/lib/email-layout";

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
  kassierer: "Kassierer",
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

// Gegenstück zu zuordnungsMailInhalt oben — informiert, wenn eine
// bestehende Zuordnung wieder entfernt wird (z.B. weil ein Wart die Person
// ausgetragen oder durch jemand anderen ersetzt hat). Ohne diese Mail
// bemerkte die betroffene Person eine entfernte Zuordnung nur, wenn sie
// zufällig selbst nochmal nachschaute.
export function zuordnungEntferntInhalt(
  rolle: string,
  termin: { start: Date; ort: string | null; beschreibung: string | null }
) {
  const zeitpunkt = formatDatumZeitLang(termin.start);
  const zeilen: string[] = [`Termin: ${zeitpunkt}`];
  if (termin.ort) zeilen.push(`Ort: ${termin.ort}`);
  if (termin.beschreibung) zeilen.push(termin.beschreibung);
  return {
    ueberschrift: `Deine Zuordnung als ${ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle} wurde entfernt.`,
    zeilen,
  };
}

// Benachrichtigt den zuständigen Wart, wenn eine eingeloggte Person sich
// über /profil von einem Termin wieder abmelden möchte (siehe selbstAbmelden
// in profil/actions.ts) — die Zuordnung wird dabei NICHT sofort entfernt,
// sondern nur als Anfrage markiert (terminZuordnungen.abmeldungAngefragtAm),
// damit eine Abmeldung nicht stillschweigend passiert, ohne dass der Wart
// die entstehende Lücke bemerkt. Der Wart entscheidet über
// abmeldungGenehmigen/abmeldungAblehnen (profil/ordnerwart/actions.ts bzw.
// profil/zeitnehmerwart/actions.ts).
export function abmeldungAngefragtInhalt(
  name: string,
  rolle: string,
  termin: { start: Date; ort: string | null; beschreibung: string | null },
  cta: { text: string; url: string }
): EmailInhalt {
  const zeitpunkt = formatDatumZeitLang(termin.start);
  const zeilen: string[] = [`Termin: ${zeitpunkt}`];
  if (termin.ort) zeilen.push(`Ort: ${termin.ort}`);
  if (termin.beschreibung) zeilen.push(termin.beschreibung);
  return {
    ueberschrift: `${name} möchte sich als ${ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle} wieder abmelden und wartet auf deine Bestätigung.`,
    zeilen,
    cta,
  };
}

// Gegenstück zu abmeldungAngefragtInhalt oben — informiert die Person
// selbst, ob ihre Abmeldeanfrage bestätigt (Zuordnung entfernt) oder
// abgelehnt (weiterhin eingeteilt) wurde.
export function abmeldungEntschiedenInhalt(
  rolle: string,
  termin: { start: Date; ort: string | null; beschreibung: string | null },
  genehmigt: boolean
): EmailInhalt {
  const zeitpunkt = formatDatumZeitLang(termin.start);
  const zeilen: string[] = [`Termin: ${zeitpunkt}`];
  if (termin.ort) zeilen.push(`Ort: ${termin.ort}`);
  if (termin.beschreibung) zeilen.push(termin.beschreibung);
  const rolleLabel = ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle;
  return {
    ueberschrift: genehmigt
      ? `Deine Abmeldung als ${rolleLabel} wurde bestätigt.`
      : `Deine Abmeldung als ${rolleLabel} wurde abgelehnt — du bist weiterhin eingeteilt.`,
    zeilen,
  };
}

// Eigene Variante von zuordnungEntferntInhalt oben, speziell für eine
// Terminverlegung beim nuLiga-/handball.net-Sync (siehe
// importiereRundenspielEreignisse in rundenspiel-sync.ts): wer sich für den
// ALTEN Zeitpunkt eingetragen hatte, kann zum neuen ggf. nicht mehr — die
// Zuordnung wird deshalb entfernt statt stillschweigend mitgenommen. Nennt
// zusätzlich den neuen Termin (statt nur "entfernt" zu melden) und einen
// Hinweis zum erneuten Eintragen, falls die Person zum neuen Termin kann.
export function zuordnungEntferntWegenVerlegungInhalt(
  rolle: string,
  neuerTermin: { start: Date; ort: string | null; beschreibung: string | null }
) {
  const zeitpunkt = formatDatumZeitLang(neuerTermin.start);
  const zeilen: string[] = [`Neuer Termin: ${zeitpunkt}`];
  if (neuerTermin.ort) zeilen.push(`Ort: ${neuerTermin.ort}`);
  if (neuerTermin.beschreibung) zeilen.push(neuerTermin.beschreibung);
  return {
    ueberschrift: `Der Termin wurde verlegt — deine Zuordnung als ${ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle} wurde daher entfernt.`,
    zeilen,
    kleingedrucktes: "Kannst du zum neuen Termin? Dann gerne erneut eintragen.",
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
  fehler: string[],
  cta: { text: string; url: string }
): EmailInhalt {
  const rolleLabel = ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle;
  return {
    ueberschrift:
      fehler.length === 1
        ? `Selbsteintragung von ${name} als ${rolleLabel} war bei einem Termin nicht möglich.`
        : `Selbsteintragung von ${name} als ${rolleLabel} war bei ${fehler.length} Terminen nicht möglich.`,
    zeilen: fehler,
    cta,
  };
}

// Benachrichtigt den Wart, wenn sich über die öffentliche Selbsteintragung
// (Ordner-/Kioskdienst-/Kassierer- bzw. Zeitnehmer-/Sekretär-Link) jemand
// mit E-Mail-Adresse registriert, den es im System noch nicht als
// Funktionsträger dieser Rolle gibt — die Rolle wird dabei bewusst INAKTIV
// angelegt (siehe ordnerSelbstEintragenMehrfachOeffentlich/
// zeitnehmerSelbstEintragenMehrfachOeffentlich), damit ein Wart die Person
// erst bestätigt/freischaltet, statt dass sich jeder mit einer beliebigen
// E-Mail-Adresse ungeprüft selbst zum Funktionsträger macht.
export function neueSelbstregistrierungInhalt(
  name: string,
  email: string,
  rolle: string,
  cta: { text: string; url: string }
): EmailInhalt {
  const rolleLabel = ZUORDNUNGS_ROLLE_LABEL[rolle] ?? rolle;
  return {
    ueberschrift: `${name} hat sich über den öffentlichen Link als ${rolleLabel} registriert und wartet auf Freischaltung.`,
    zeilen: [`E-Mail: ${email}`],
    cta,
  };
}

// Prüft die Besetzungs-Obergrenze, BEVOR eine weitere Person eingetragen
// wird — schiedsrichter max. SCHIRI_GESPANN_MAX (fest 2 als Gespann),
// zeitnehmer/sekretaer JEWEILS max. 1 (eigene, unabhängige Rollen, siehe
// ZEITNEHMER_ROLLE_MAX/SEKRETAER_ROLLE_MAX in besetzung.ts). Wirft, wenn die
// Grenze für `rolle` bereits erreicht ist, unabhängig davon, ob dieselbe
// oder eine andere Person die Rolle schon hält. Bei einer Umbesetzung
// ("Ersetzen") entfernen alle Aufrufstellen die bisherige Zuordnung VOR
// diesem Aufruf, in derselben Transaktion — die frisch geladenen
// `bestehende` sehen sie dadurch bereits nicht mehr, ohne dass diese
// Funktion einen eigenen Ausnahme-Parameter bräuchte. Gemeinsam genutzt vom
// Kalender-Modal und den Wart-Rollen /profil/schiedsrichterwart und
// /profil/zeitnehmerwart — liegt hier statt in einer der
// "use server"-Action-Dateien, da deren Exporte ausschließlich async Server
// Actions mit serialisierbaren Parametern sein dürfen (tx ist das nicht).
export async function pruefeBesetzungsgrenze(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  // Nicht mehr gebraucht, seit die Obergrenze nicht mehr aus den
  // Vereinseinstellungen kommt (siehe oben) — Parameter bleibt aus
  // Kompatibilität zu den bestehenden Aufrufstellen erhalten.
  _vereinId: string,
  terminId: string,
  rolle: (typeof ZUORDENBARE_TYPEN)[number]
) {
  const bestehende = await tx.query.terminZuordnungen.findMany({
    where: eq(terminZuordnungen.terminId, terminId),
  });
  const status = berechneBesetzung(bestehende);
  if (rolle === "schiedsrichter" && status.schiriVoll) {
    throw new Error(
      `Es sind bereits ${SCHIRI_GESPANN_MAX} Schiedsrichter (Gespann-Maximum) zugeordnet.`
    );
  }
  if (rolle === "zeitnehmer" && status.zeitnehmerVoll) {
    throw new Error("Es ist bereits ein Zeitnehmer zugeordnet.");
  }
  if (rolle === "sekretaer" && status.sekretaerVoll) {
    throw new Error("Es ist bereits ein Sekretär zugeordnet.");
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
            abmeldungAngefragtAm: terminZuordnungen.abmeldungAngefragtAm,
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
