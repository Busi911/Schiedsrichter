import "server-only";
import { and, asc, eq, gte, inArray, lte, ne, type SQL } from "drizzle-orm";
import { withTenant } from "@/db";
import { mannschaften, termine, terminZuordnungen, users, vereine } from "@/db/schema";
import { tagKey } from "./kalender";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "./dienste";

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
  mannschaftAltersklasse: string | null;
  heimMannschaftName: string | null;
  kategorie: string | null;
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

// Für die Rollen-Auswahl beim Excel/PDF-Export (siehe admin/auswertung/
// page.tsx sowie termin-pdf.ts/termin-excel.ts) — alle sechs Dienst-Rollen,
// die im Dienstplan als Spalte auftauchen können.
export const AUSWERTUNG_ROLLEN = ["schiedsrichter", ...ANDERE_ROLLEN] as const;
export type AuswertungsRolle = (typeof AUSWERTUNG_ROLLEN)[number];
export const AUSWERTUNG_ROLLE_LABEL: Record<AuswertungsRolle, string> = {
  schiedsrichter: "Schiedsrichter",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

export type RollenBedarf = Record<Exclude<AuswertungsRolle, "schiedsrichter">, boolean>;

// Gemeinsam für Tabelle (admin/auswertung/page.tsx), PDF (termin-pdf.ts) und
// Excel (termin-excel.ts): ohne diese Unterscheidung sah eine Rolle ohne
// Bedarf (z.B. Kassierer für diese Mannschaft abgeschaltet, siehe
// bedarfFuer in dienste.ts) optisch identisch zu "noch nicht besetzt" aus.
// bedarf === undefined (z.B. Schiedsrichter, für die es kein bedarfFuer
// gibt) verhält sich wie true — dann bleibt es beim bisherigen leerWert.
export function rollenZellenWert(
  name: string | null,
  bedarf: boolean | undefined,
  leerWert: string
): string {
  if (name) return name;
  return bedarf === false ? "intern" : leerWert;
}

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

// Hängt die Altersklasse in Klammern an den Mannschaftsnamen an, sofern
// beides bekannt ist — z.B. "TSF Heuchelheim (Herren)".
export function mannschaftMitAltersklasse(
  name: string | null,
  altersklasse: string | null
): string | null {
  if (!name) return null;
  return altersklasse ? `${name} (${altersklasse})` : name;
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
// nuligaSchiedsrichterKuerzel in rundenspiel-import.ts), wird das Kürzel als
// Fallback angezeigt statt "—", aber bewusst nicht in schiedsrichterIds, da
// es keine echte Person mit userId ist und daher nicht über den
// Schiedsrichter-Filter gefunden werden kann.
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
      : t.icsSchiedsrichterName ?? t.nuligaSchiedsrichterKuerzel ?? null;

    return {
      id: t.id,
      typ: t.typ,
      start: t.start,
      ende: t.ende,
      ort: t.ort,
      beschreibung: t.beschreibung,
      pflichtspiel: t.pflichtspiel,
      freundschaftsTyp: t.freundschaftsTyp,
      // Fällt auf den rohen Heim-Namen aus dem Import zurück, wenn (noch)
      // keine Verknüpfung zu einer lokalen Mannschaft besteht (siehe
      // "Unbekannte Mannschaften" in admin/termine/page.tsx) — sonst stand
      // die Spalte leer, obwohl der Name aus nuLiga/handball.net längst
      // bekannt ist. Alle Termine hier sind Spiele an der eigenen Halle
      // (siehe Hinweis in admin/termine/page.tsx), daher ist der Heim-Name
      // immer die relevante Mannschaft. Altersklasse dahinter in Klammern,
      // wenn bekannt — bei einer verknüpften Mannschaft aus deren eigenem
      // Feld, sonst (Fallback, siehe oben) aus der vom Import gelieferten
      // Kategorie (z.B. "mJC"), die aus demselben Grund existiert: gleiche
      // Vereinsnamen in unterschiedlichen Altersklassen unterscheiden.
      mannschaftName: mannschaftMitAltersklasse(
        t.mannschaftName ?? t.heimMannschaftName,
        t.mannschaftAltersklasse ?? t.kategorie
      ),
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
    // Ohne explizites "von" gilt der Dienstplan ab heute (Europe/Berlin) statt
    // der gesamten Vereinshistorie — "bis" bleibt dagegen bewusst unbegrenzt
    // ("unendlich"), da es keinen sinnvollen oberen Standard-Wert gibt.
    // "||" statt "??": ein geleertes <input type="date"> (siehe admin/
    // auswertung/page.tsx) sendet einen leeren String, kein fehlendes Feld —
    // der soll denselben Default auslösen wie gar kein "von" in der URL.
    const vonEffektiv = filter.von || tagKey(new Date());
    const bedingungen: SQL[] = [
      eq(termine.vereinId, vereinId),
      ne(termine.typ, "spiel_ics"),
      gte(termine.start, new Date(vonEffektiv)),
    ];

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
        mannschaftAltersklasse: mannschaften.altersklasse,
        heimMannschaftName: termine.heimMannschaftName,
        kategorie: termine.kategorie,
        mannschaftId: termine.mannschaftId,
        zeitnehmerBedarfOverride: termine.zeitnehmerBedarfOverride,
        ordnerBedarfDeaktiviert: mannschaften.ordnerBedarfDeaktiviert,
        kioskdienstBedarfDeaktiviert: mannschaften.kioskdienstBedarfDeaktiviert,
        kassiererBedarfDeaktiviert: mannschaften.kassiererBedarfDeaktiviert,
        zeitnehmerBedarfDeaktiviert: mannschaften.zeitnehmerBedarfDeaktiviert,
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

    const ergebnis = ergaenzeDienstZuordnungen(zeilen, andereZuordnungen);

    // Ordner/Kioskdienst/Kassierer/Zeitnehmer-Sekretär braucht nicht jeder
    // Termin (siehe bedarfFuer in dienste.ts, z.B. abgeschaltet pro
    // Mannschaft oder gar nicht Teil des Vereins-Bedarfs) — ohne diese Info
    // sah eine deshalb leere Spalte im Export genauso aus wie "noch nicht
    // besetzt". Das rollenBedarf-Feld unten macht die Unterscheidung nach
    // außen verfügbar (siehe rollenZellenWert oben, genutzt von
    // admin/auswertung/page.tsx, termin-pdf.ts und termin-excel.ts, die
    // dann statt einer leeren Zelle "intern" zeigen).
    const vereinRow = await tx.query.vereine.findFirst({
      where: eq(vereine.id, vereinId),
    });
    const bedarfProTermin = new Map<string, RollenBedarf>();
    if (vereinRow) {
      for (const t of basisListe) {
        // t.mannschaftId === null → kein Mannschaftsbezug, dann kommen die
        // Deaktivierungs-Flags aus dem LEFT JOIN oben ebenfalls als null
        // zurück statt als "nicht deaktiviert" (false) — mannschaft bleibt
        // hier bewusst null, analog zum selben Muster in admin-kalender.ts.
        const mannschaft = t.mannschaftId
          ? {
              ordnerBedarfDeaktiviert: t.ordnerBedarfDeaktiviert ?? false,
              kioskdienstBedarfDeaktiviert: t.kioskdienstBedarfDeaktiviert ?? false,
              kassiererBedarfDeaktiviert: t.kassiererBedarfDeaktiviert ?? false,
              zeitnehmerBedarfDeaktiviert: t.zeitnehmerBedarfDeaktiviert ?? false,
            }
          : null;
        const zeitnehmerBedarf = bedarfFuer(
          vereinRow,
          t.typ,
          "zeitnehmer",
          t.pflichtspiel,
          t.freundschaftsTyp,
          t.zeitnehmerBedarfOverride,
          mannschaftBedarfDeaktiviertFuer(mannschaft, "zeitnehmer")
        );
        bedarfProTermin.set(t.id, {
          ordner:
            bedarfFuer(
              vereinRow,
              t.typ,
              "ordner",
              t.pflichtspiel,
              t.freundschaftsTyp,
              undefined,
              mannschaftBedarfDeaktiviertFuer(mannschaft, "ordner")
            ) > 0,
          kioskdienst:
            bedarfFuer(
              vereinRow,
              t.typ,
              "kioskdienst",
              t.pflichtspiel,
              t.freundschaftsTyp,
              undefined,
              mannschaftBedarfDeaktiviertFuer(mannschaft, "kioskdienst")
            ) > 0,
          kassierer:
            bedarfFuer(
              vereinRow,
              t.typ,
              "kassierer",
              t.pflichtspiel,
              t.freundschaftsTyp,
              undefined,
              mannschaftBedarfDeaktiviertFuer(mannschaft, "kassierer")
            ) > 0,
          zeitnehmer: zeitnehmerBedarf > 0,
          // Zeitnehmer und Sekretär teilen sich denselben Mindestbedarf
          // (siehe zeitnehmerSekretaerBedarf in besetzung.ts) — eine eigene
          // Deaktivierung für Sekretär gibt es nicht.
          sekretaer: zeitnehmerBedarf > 0,
        });
      }
    }

    return ergebnis.map((z) => ({
      ...z,
      rollenBedarf: bedarfProTermin.get(z.id),
    }));
  });
}
