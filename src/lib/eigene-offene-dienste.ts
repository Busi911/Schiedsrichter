import "server-only";
import { and, eq, gte, inArray, notInArray } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  mannschaften,
  termine,
  terminTypEnum,
  terminZuordnungen,
  vereine,
} from "@/db/schema";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { berechneBesetzung } from "@/lib/besetzung";
import { ORDNER_ROLLEN } from "@/lib/ordnerwart";

type TerminTyp = (typeof terminTypEnum.enumValues)[number];
// Ordner/Kioskdienst/Kassierer (bedarfFuer's "ordner"|"kioskdienst"|
// "kassierer") plus Zeitnehmer/Sekretär (bedarfFuer's "zeitnehmer" bzw. die
// dieselbe Bedarfslogik nutzende "sekretaer") — die beiden Rollenfamilien
// unten.
type DienstRolle = (typeof ORDNER_ROLLEN)[number] | "zeitnehmer" | "sekretaer";

// Zentrale Stelle für "welche Rollen kann sich eine eingeloggte Person auf
// /profil selbst zu- bzw. abmelden" (siehe selbstAnmelden/selbstAbmelden in
// profil/actions.ts und die Karte "Offene Dienste" in profil/page.tsx).
// Schiedsrichter fehlt hier bewusst: keine öffentliche Selbsteintragung dafür
// (siehe Kommentar in offene-selbsteintragungen.ts), bleibt Admin-/
// Schiedsrichterwart-Sache.
//
// Zwei Rollenfamilien mit jeweils eigener Termin-Auswahl und "voll"-Logik:
// Ordner/Kioskdienst/Kassierer gelten für den TURNIER-CONTAINER (ein Dienst
// pro Veranstaltung, Kapazität IST der konfigurierte Bedarf), Zeitnehmer/
// Sekretär dagegen PRO EINZELSPIEL (auch beim Turnier: turnier_spiel statt
// des Containers, siehe bedarfFuer) mit fester Obergrenze von je 1
// unabhängig vom konfigurierten Bedarf (siehe berechneBesetzung).
//
// EINE NEUE SELBSTANMELDBARE ROLLE HINZUFÜGEN:
// 1. Rolle einer der beiden Familien unten hinzufügen — oder, falls weder
//    Termin-Auswahl noch Kapazitätslogik passt, eine weitere Familie mit
//    eigenem `terminAuswahl`/`istVoll` in FAMILIEN ergänzen.
// 2. Falls die neue Rolle keiner der beiden bestehenden Kapazitätslogiken
//    folgt: in profil/actions.ts::selbstAnmelden den passenden Zweig
//    ergänzen (Bedarfsgrenze wie bei Ordner vs. feste Obergrenze wie bei
//    Zeitnehmer/Sekretär).
// 3. TYP_LABEL in profil/page.tsx um das Label ergänzen.
// Anzeige, das Ausblenden voll besetzter Termine/Rollen sowie Anmelden/
// Abmelden funktionieren dann automatisch — siehe holeEigeneOffenenDienste
// unten.
type TerminAuswahl =
  | { modus: "nur"; typen: readonly TerminTyp[] }
  | { modus: "alle_ausser"; typen: readonly TerminTyp[] };

type Rollenfamilie = {
  typen: readonly DienstRolle[];
  terminAuswahl: TerminAuswahl;
  istVoll: (
    zuordnungenDerRolle: { userId: string | null }[],
    zuordnungenDesTermins: { funktionstraegerTyp: string }[],
    typ: DienstRolle,
    bedarf: number
  ) => boolean;
};

const ORDNER_FAMILIE: Rollenfamilie = {
  typen: ORDNER_ROLLEN,
  terminAuswahl: { modus: "nur", typen: ["testspiel", "turnier", "rundenspiel"] },
  istVoll: (zuordnungenDerRolle, _zuordnungenDesTermins, _typ, bedarf) =>
    zuordnungenDerRolle.length >= bedarf,
};

const ZEITNEHMER_TYPEN = ["zeitnehmer", "sekretaer"] as const;
const ZEITNEHMER_FAMILIE: Rollenfamilie = {
  typen: ZEITNEHMER_TYPEN,
  // Turnier-Container selbst ausgeschlossen (kein Zuordnungsziel für
  // Zeitnehmer/Sekretär, siehe oben) — alle anderen Typen (inkl. spiel_ics,
  // falls der Zeitnehmerwart dafür per zeitnehmerBedarfOverride
  // ausnahmsweise einen Bedarf gesetzt hat) sind relevant.
  terminAuswahl: { modus: "alle_ausser", typen: ["turnier"] },
  istVoll: (_zuordnungenDerRolle, zuordnungenDesTermins, typ) => {
    const besetzung = berechneBesetzung(zuordnungenDesTermins);
    return typ === "zeitnehmer" ? besetzung.zeitnehmerVoll : besetzung.sekretaerVoll;
  },
};

const FAMILIEN = [ORDNER_FAMILIE, ZEITNEHMER_FAMILIE];

export const SELBST_ANMELDBARE_TYPEN = [
  ...ORDNER_ROLLEN,
  ...ZEITNEHMER_TYPEN,
] as const;

export type EigenerOffenerDienst = {
  terminId: string;
  start: Date;
  ort: string | null;
  beschreibung: string | null;
  rollen: {
    typ: (typeof SELBST_ANMELDBARE_TYPEN)[number];
    // Gesetzt, wenn die Person für diese Rolle an diesem Termin bereits
    // eingetragen ist (Button zeigt dann "abmelden" statt "anmelden").
    zuordnungId: string | null;
    // Nur relevant, wenn zuordnungId gesetzt ist: die Person hat sich schon
    // wieder abmelden wollen, der zuständige Wart hat das aber noch nicht
    // bestätigt (siehe selbstAbmelden in profil/actions.ts) — Button zeigt
    // dann "Abmeldung angefragt" statt "angemeldet".
    abmeldungAngefragt: boolean;
    // Fortschritts-Hinweis ("1/2") nur bei der Ordner-Familie sinnvoll, da
    // dort Bedarf == Obergrenze ist — bei Zeitnehmer/Sekretär (feste
    // Obergrenze 1, unabhängig vom konfigurierten Bedarf) wäre ein Zähler
    // irreführend.
    anzahlHinweis: string | null;
  }[];
};

// Liefert, pro anstehendem Termin, alle Rollen aus `eigeneAktiveTypen`, für
// die dort noch ein Platz frei ist (oder für die die Person bereits
// eingetragen ist, damit sie sich wieder abmelden kann) — vollständig
// besetzte Rollen ohne eigene Zuordnung sowie Termine ohne jede offene Rolle
// werden gar nicht erst zurückgegeben.
export async function holeEigeneOffenenDienste(
  vereinId: string,
  userId: string,
  eigeneAktiveTypen: readonly string[]
): Promise<EigenerOffenerDienst[]> {
  return withTenant(vereinId, async (tx) => {
    const verein = await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) });
    if (!verein) return [];

    const ergebnisProTermin = new Map<string, EigenerOffenerDienst>();

    for (const familie of FAMILIEN) {
      const eigeneTypenDieserFamilie = familie.typen.filter((t) =>
        eigeneAktiveTypen.includes(t)
      );
      if (eigeneTypenDieserFamilie.length === 0) continue;

      const terminListe = await tx.query.termine.findMany({
        where: and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, new Date()),
          familie.terminAuswahl.modus === "nur"
            ? inArray(termine.typ, [...familie.terminAuswahl.typen])
            : notInArray(termine.typ, [...familie.terminAuswahl.typen])
        ),
        orderBy: (t, { asc }) => [asc(t.start)],
      });
      if (terminListe.length === 0) continue;

      const terminIds = terminListe.map((t) => t.id);
      const zuordnungen = await tx.query.terminZuordnungen.findMany({
        where: inArray(terminZuordnungen.terminId, terminIds),
      });

      const mannschaftIds = [
        ...new Set(
          terminListe.map((t) => t.mannschaftId).filter((id): id is string => !!id)
        ),
      ];
      const mannschaftenListe = mannschaftIds.length
        ? await tx.query.mannschaften.findMany({
            where: inArray(mannschaften.id, mannschaftIds),
          })
        : [];

      for (const termin of terminListe) {
        const mannschaft = termin.mannschaftId
          ? mannschaftenListe.find((m) => m.id === termin.mannschaftId)
          : null;
        const zuordnungenDesTermins = zuordnungen.filter(
          (z) => z.terminId === termin.id
        );

        for (const typ of eigeneTypenDieserFamilie) {
          const bedarf = bedarfFuer(
            verein,
            termin.typ,
            typ,
            termin.pflichtspiel,
            termin.freundschaftsTyp,
            termin.zeitnehmerBedarfOverride,
            mannschaftBedarfDeaktiviertFuer(mannschaft, typ)
          );
          if (bedarf <= 0) continue;

          const zuordnungenDerRolle = zuordnungenDesTermins.filter(
            (z) => z.funktionstraegerTyp === typ
          );
          const bestehend = zuordnungenDerRolle.find((z) => z.userId === userId);
          const voll = familie.istVoll(zuordnungenDerRolle, zuordnungenDesTermins, typ, bedarf);
          if (voll && !bestehend) continue;

          const eintrag = ergebnisProTermin.get(termin.id) ?? {
            terminId: termin.id,
            start: termin.start,
            ort: termin.ort,
            beschreibung: termin.beschreibung,
            rollen: [],
          };
          eintrag.rollen.push({
            typ,
            zuordnungId: bestehend?.id ?? null,
            abmeldungAngefragt: bestehend?.abmeldungAngefragtAm != null,
            anzahlHinweis:
              familie === ORDNER_FAMILIE ? `${zuordnungenDerRolle.length}/${bedarf}` : null,
          });
          ergebnisProTermin.set(termin.id, eintrag);
        }
      }
    }

    return [...ergebnisProTermin.values()].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );
  });
}
