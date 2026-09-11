import "server-only";
import { and, asc, eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users } from "@/db/schema";

export type AuswertungFilter = {
  von?: string;
  bis?: string;
  typ?: string;
  schiedsrichterId?: string;
};

// Ohne spiel_ics — das sind persönliche ICS-Einsätze eines Schiedsrichters,
// oft bei fremden Vereinen ohne jeden Bezug zur eigenen Halle (siehe gleiche
// Einschränkung bei bedarfFuer in dienste.ts). Im Dienstplan (Ordner/
// Kioskdienst/Kassierer/Zeitnehmer/Sekretär) sind sie reines Rauschen, da es
// dafür nie einen Bedarf gibt.
const TERMIN_TYPEN = [
  "testspiel",
  "turnier",
  "turnier_spiel",
  "rundenspiel",
] as const;

export type AuswertungsBasisZeile = {
  id: string;
  typ: string;
  start: Date;
  ende: Date | null;
  ort: string | null;
  beschreibung: string | null;
  pflichtspiel: boolean | null;
  freundschaftsTyp: "freundschaftsspiel" | "turnier" | null;
  mannschaftName: string | null;
  icsSchiedsrichterId: string | null;
  icsSchiedsrichterName: string | null;
  icsSchiedsrichterEmail: string | null;
  nuligaSchiedsrichterKuerzel: string | null;
};

export type ManuelleSchiedsrichterZuordnung = {
  terminId: string;
  userId: string | null;
  name: string | null;
  email: string | null;
};

// Die vier anderen Dienst-Rollen (siehe ORDNER_ROLLEN in ordnerwart.ts plus
// Zeitnehmer/Sekretär) — anders als beim Schiedsrichter oben gibt es dafür
// keine ICS-Selbst-Abo-Quelle, nur termin_zuordnung, daher reicht hier eine
// einfache Name-Liste pro Termin+Rolle statt der aufwändigeren
// Kombinationslogik oben.
const ANDERE_ROLLEN = [
  "ordner",
  "kioskdienst",
  "kassierer",
  "zeitnehmer",
  "sekretaer",
] as const;
type AndereRolle = (typeof ANDERE_ROLLEN)[number];

const ANDERE_ROLLE_FELD: Record<AndereRolle, string> = {
  ordner: "ordnerName",
  kioskdienst: "kioskdienstName",
  kassierer: "kassiererName",
  zeitnehmer: "zeitnehmerName",
  sekretaer: "sekretaerName",
};

export type DienstRollenFelder = {
  ordnerName: string | null;
  kioskdienstName: string | null;
  kassiererName: string | null;
  zeitnehmerName: string | null;
  sekretaerName: string | null;
};

export type AndereZuordnung = {
  terminId: string;
  funktionstraegerTyp: string;
  name: string | null;
};

// Reine Zusammenführung (ohne DB-Zugriff, siehe kombiniereSchiedsrichter-
// Zuordnungen oben) — mehrere Personen je Termin+Rolle (z.B. zwei
// Kioskdienste) werden mit ", " zu einem Spaltenwert zusammengefasst
// (anders als beim Schiedsrichter-Gespann, das " / " nutzt, um die
// besondere Zweier-Paarung sichtbar zu halten).
export function ergaenzeDienstZuordnungen<T extends { id: string }>(
  zeilen: T[],
  zuordnungen: AndereZuordnung[]
): (T & DienstRollenFelder)[] {
  const namenProTerminUndRolle = new Map<string, string[]>();
  for (const z of zuordnungen) {
    if (!z.name) continue;
    const schluessel = `${z.terminId}|${z.funktionstraegerTyp}`;
    const liste = namenProTerminUndRolle.get(schluessel) ?? [];
    liste.push(z.name);
    namenProTerminUndRolle.set(schluessel, liste);
  }

  return zeilen.map((zeile) => {
    const felder = {} as DienstRollenFelder;
    for (const rolle of ANDERE_ROLLEN) {
      const namen = namenProTerminUndRolle.get(`${zeile.id}|${rolle}`);
      felder[ANDERE_ROLLE_FELD[rolle] as keyof DienstRollenFelder] =
        namen && namen.length > 0 ? namen.join(", ") : null;
    }
    return { ...zeile, ...felder };
  });
}

// Reine Zusammenführung (ohne DB-Zugriff), damit sie ohne Testdatenbank
// getestet werden kann — siehe termin-auswertung.test.ts. icsSchiedsrichter*
// deckt nur die (ältere) Selbst-Abo-Zuordnung über den persönlichen
// ICS-Feed ab — die heute übliche Zuordnung über den Admin-Kalender bzw.
// die Wart-Rollen läuft über termin_zuordnung (siehe zuordnung.ts) und
// wurde hier bisher gar nicht berücksichtigt, weshalb zugeordnete
// Schiedsrichter in der Auswertung als "—" erschienen. Beide Quellen
// werden pro Termin zu EINER Schiedsrichter-Spalte kombiniert (" / "
// getrennt bei Gespann-Besetzung, siehe SCHIRI_GESPANN_MAX in
// besetzung.ts) — manuelle Zuordnung hat Vorrang, falls (unüblich) beides
// für denselben Termin vorhanden wäre. Ist noch niemand zugeordnet, aber
// nuLiga hat für den Termin ein Schiedsrichter-Kürzel geliefert (siehe
// nuligaSchiedsrichterKuerzel in rundenspiel-import.ts), wird das als
// Fallback angezeigt statt "—" — analog zur "nuLiga-Ansetzung
// (noch nicht zugeordnet)"-Zeile im Kalender-Modal (admin/kalender/
// page.tsx), aber bewusst nicht in schiedsrichterIds, da es keine echte
// Person mit userId ist und daher nicht über den Schiedsrichter-Filter
// gefunden werden kann.
export function kombiniereSchiedsrichterZuordnungen(
  basisListe: AuswertungsBasisZeile[],
  manuelleZuordnungen: ManuelleSchiedsrichterZuordnung[],
  schiedsrichterIdFilter?: string
) {
  const zuordnungenProTermin = new Map<string, ManuelleSchiedsrichterZuordnung[]>();
  for (const z of manuelleZuordnungen) {
    const liste = zuordnungenProTermin.get(z.terminId) ?? [];
    liste.push(z);
    zuordnungenProTermin.set(z.terminId, liste);
  }

  const ergebnis = basisListe.map((t) => {
    const manuell = zuordnungenProTermin.get(t.id) ?? [];
    const schiedsrichterIds = [
      ...manuell.map((m) => m.userId),
      t.icsSchiedsrichterId,
    ].filter((id): id is string => id !== null);

    const schiedsrichterName = manuell.length
      ? manuell.map((m) => m.name ?? m.email ?? "").join(" / ")
      : t.icsSchiedsrichterName ??
        (t.nuligaSchiedsrichterKuerzel
          ? `${t.nuligaSchiedsrichterKuerzel} (laut nuLiga, noch nicht zugeordnet)`
          : null);

    return {
      id: t.id,
      typ: t.typ,
      start: t.start,
      ende: t.ende,
      ort: t.ort,
      beschreibung: t.beschreibung,
      pflichtspiel: t.pflichtspiel,
      freundschaftsTyp: t.freundschaftsTyp,
      mannschaftName: t.mannschaftName,
      schiedsrichterName,
      schiedsrichterEmail: manuell.length
        ? manuell.map((m) => m.email).filter((e) => e).join(" / ") || null
        : t.icsSchiedsrichterEmail,
      schiedsrichterIds,
    };
  });

  const gefiltert = schiedsrichterIdFilter
    ? ergebnis.filter((t) => t.schiedsrichterIds.includes(schiedsrichterIdFilter))
    : ergebnis;
  return gefiltert.map(({ schiedsrichterIds, ...rest }) => rest);
}

export async function holeTermineFuerAuswertung(
  vereinId: string,
  filter: AuswertungFilter
) {
  return withTenant(vereinId, async (tx) => {
    const bedingungen: SQL[] = [
      eq(termine.vereinId, vereinId),
      ne(termine.typ, "spiel_ics"),
    ];

    if (filter.von) bedingungen.push(gte(termine.start, new Date(filter.von)));
    if (filter.bis) bedingungen.push(lte(termine.start, new Date(filter.bis)));
    if (
      filter.typ &&
      (TERMIN_TYPEN as readonly string[]).includes(filter.typ)
    ) {
      bedingungen.push(
        eq(termine.typ, filter.typ as (typeof TERMIN_TYPEN)[number])
      );
    }

    const basisListe = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        start: termine.start,
        ende: termine.ende,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        pflichtspiel: termine.pflichtspiel,
        freundschaftsTyp: termine.freundschaftsTyp,
        mannschaftName: mannschaften.name,
        icsSchiedsrichterId: termine.icsSchiedsrichterId,
        icsSchiedsrichterName: users.name,
        icsSchiedsrichterEmail: users.email,
        nuligaSchiedsrichterKuerzel: termine.nuligaSchiedsrichterKuerzel,
      })
      .from(termine)
      .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
      .leftJoin(users, eq(termine.icsSchiedsrichterId, users.id))
      .where(and(...bedingungen))
      .orderBy(asc(termine.start));

    // Separate Abfrage statt JOIN, da ein Termin bei Gespann-Besetzung ZWEI
    // Schiedsrichter-Zuordnungen haben kann (und Ordner/Kioskdienst analog
    // mehrere Personen) und ein direkter JOIN die Termin-Zeile sonst
    // verdoppeln würde (siehe kombiniereSchiedsrichterZuordnungen und
    // ergaenzeDienstZuordnungen oben). Eine gemeinsame Abfrage für ALLE
    // Rollen statt einer je Rolle, danach clientseitig aufgeteilt.
    const terminIds = basisListe.map((t) => t.id);
    const alleZuordnungen = terminIds.length
      ? await tx
          .select({
            terminId: terminZuordnungen.terminId,
            funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
            userId: terminZuordnungen.userId,
            externerName: terminZuordnungen.externerName,
            name: users.name,
            email: users.email,
          })
          .from(terminZuordnungen)
          .leftJoin(users, eq(terminZuordnungen.userId, users.id))
          .where(inArray(terminZuordnungen.terminId, terminIds))
      : [];

    const schiedsrichterZuordnungen = alleZuordnungen.filter(
      (z) => z.funktionstraegerTyp === "schiedsrichter"
    );
    const andereZuordnungen: AndereZuordnung[] = alleZuordnungen
      .filter((z) => z.funktionstraegerTyp !== "schiedsrichter")
      .map((z) => ({
        terminId: z.terminId,
        funktionstraegerTyp: z.funktionstraegerTyp,
        name: z.name ?? z.externerName,
      }));

    const zeilen = kombiniereSchiedsrichterZuordnungen(
      basisListe,
      schiedsrichterZuordnungen.map((z) => ({
        terminId: z.terminId,
        userId: z.userId,
        name: z.name ?? z.externerName,
        email: z.email,
      })),
      filter.schiedsrichterId
    );

    return ergaenzeDienstZuordnungen(zeilen, andereZuordnungen);
  });
}
