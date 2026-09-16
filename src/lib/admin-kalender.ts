import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, lte, ne, or } from "drizzle-orm";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { monatsBereich, tagKey } from "@/lib/kalender";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { formatMannschaft } from "@/lib/dashboard";
import {
  berechneBesetzung,
  brauchtSchiedsrichterVomVerein,
  externeAnsetzungsAnzahlen,
  istBesetzungVollstaendig,
} from "@/lib/besetzung";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { holeOrdnerEinsatzZahlen, ORDNER_ROLLEN } from "@/lib/ordnerwart";
import { holeZuordenbareFunktionstraeger } from "@/lib/zuordnung";
import {
  angesetzteNamenPassenZu,
  schiedsrichterKuerzelPasstZu,
} from "@/lib/rundenspiel-import";
import type { KalenderEintrag, TurnierBalkenBearbeitbar } from "@/components/monats-kalender";
import { formatZeit } from "@/lib/format";
import { formatErgebnis, rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
};

// Nur diese Typen brauchen eine Schiri-/Zeitnehmer-/Sekretär-Zuordnung —
// der Turnier-Container selbst wird pro Einzelspiel besetzt (siehe
// src/lib/zuordnung.ts). Rundenspiele brauchen nur Zeitnehmer/Sekretär
// (siehe istBesetzungVollstaendig in src/lib/besetzung.ts). spiel_ics taucht
// hier gar nicht erst auf (siehe Ausschluss unten in der Termine-Abfrage).
const BESETZUNGSRELEVANTE_TYPEN = ["testspiel", "turnier_spiel", "rundenspiel"];
// Nur manuell angelegte Termine (Testspiel/Turnier/Turnierspiel) sind
// bearbeitbar — ICS-Feed- und Rundenspiel-Import-Termine werden von ihrer
// jeweiligen Quelle verwaltet.
const BEARBEITBARE_TYPEN = ["testspiel", "turnier", "turnier_spiel"];

// Daten für einen Monat des <MonatsKalender>-Übersichtskalenders — geteilt
// zwischen /admin/kalender (eigene Seite) und /admin (Übersicht, dort
// eingebettet), damit diese recht involvierte Zusammenstellung
// (Besetzungsstatus, nuLiga-Abgleich, Turnier-Balken usw.) nur an einer
// Stelle gepflegt werden muss.
export async function holeAdminKalenderDaten(
  vereinId: string,
  jahr: number,
  monatNull: number
) {
  const { von, bis } = monatsBereich(jahr, monatNull);

  const [termineDesMonats, zuordnungen, mannschaftsListe, trainerListe, verein] =
    await withTenant(vereinId, async (tx) => {
      const termineDesMonats = await tx
        .select({
          id: termine.id,
          typ: termine.typ,
          start: termine.start,
          ende: termine.ende,
          ort: termine.ort,
          beschreibung: termine.beschreibung,
          turnierId: termine.turnierId,
          pflichtspiel: termine.pflichtspiel,
          freundschaftsTyp: termine.freundschaftsTyp,
          ergebnisHeim: termine.ergebnisHeim,
          ergebnisAuswaerts: termine.ergebnisAuswaerts,
          nuligaSchiedsrichterKuerzel: termine.nuligaSchiedsrichterKuerzel,
          handballNetSchiedsrichter: termine.handballNetSchiedsrichter,
          handballNetZeitnehmer: termine.handballNetZeitnehmer,
          mannschaftId: termine.mannschaftId,
          mannschaftName: mannschaften.name,
          mannschaftAltersklasse: mannschaften.altersklasse,
          kategorie: termine.kategorie,
          turnierVerantwortlicherId: termine.turnierVerantwortlicherId,
          zeitnehmerBedarfOverride: termine.zeitnehmerBedarfOverride,
        })
        .from(termine)
        .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
        .where(
          and(
            eq(termine.vereinId, vereinId),
            // spiel_ics = persönlicher ICS-Feed-Einsatz eines Schiedsrichters
            // (oft bei fremden Vereinen, siehe icsSchiedsrichterId) — kein
            // Vereins-Termin, gehört daher nicht in den Admin-Kalender. Bei
            // eigenen Heimspielen existiert parallel ohnehin ein
            // testspiel/turnier_spiel/rundenspiel-Termin (siehe "Mögliche
            // Duplikate" auf /admin/termine).
            ne(termine.typ, "spiel_ics"),
            // Normalfall: Termin beginnt im angezeigten Monat. Zusätzlich
            // mehrtägige Turniere, die VOR diesem Monat begonnen haben, aber
            // noch hineinreichen (sonst würde der Balken im zweiten Monat
            // fehlen, siehe MonatsKalender-Balken-Rendering).
            or(
              and(gte(termine.start, von), lte(termine.start, bis)),
              and(
                eq(termine.typ, "turnier"),
                isNotNull(termine.ende),
                gte(termine.ende, von),
                lte(termine.start, bis)
              )
            )
          )
        )
        .orderBy(asc(termine.start));

      const terminIds = termineDesMonats.map((t) => t.id);
      const zuordnungen = terminIds.length
        ? await tx
            .select({
              id: terminZuordnungen.id,
              terminId: terminZuordnungen.terminId,
              funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
              name: users.name,
              email: users.email,
              externerName: terminZuordnungen.externerName,
            })
            .from(terminZuordnungen)
            .leftJoin(users, eq(terminZuordnungen.userId, users.id))
            .where(inArray(terminZuordnungen.terminId, terminIds))
        : [];

      const mannschaftsListe = sortiereMannschaften(
        await tx.query.mannschaften.findMany({
          where: eq(mannschaften.vereinId, vereinId),
        })
      );

      // Kandidaten für "Turnierverantwortlicher" — funktionstraeger_rolle ist
      // per RLS ohnehin auf den eigenen Verein beschränkt (siehe
      // 0001_enable_rls_multi_tenant.sql).
      const trainerListe = await tx
        .select({ userId: users.id, name: users.name, email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(
          and(
            eq(funktionstraegerRollen.typ, "trainer"),
            eq(funktionstraegerRollen.aktiv, true)
          )
        )
        .orderBy(users.name);

      const verein = await tx.query.vereine.findFirst({
        where: eq(vereine.id, vereinId),
      });

      return [termineDesMonats, zuordnungen, mannschaftsListe, trainerListe, verein];
    });

  // Ordner/Kioskdienst/Kassierer waren im Zuordnen-Modal bisher gar nicht
  // wählbar (nur über /profil/ordnerwart) — hier zu den Schiedsrichter-/
  // Zeitnehmer-/Sekretär-Kandidaten dazugemischt, damit sich auch diese
  // Dienste direkt im Admin-Kalender zuordnen lassen (siehe zuordnen in
  // admin/zuordnung/actions.ts, das jetzt beide Rollen-Familien annimmt).
  // holeOrdnerEinsatzZahlen liefert eine Zeile PRO PERSON mit all ihren
  // Rollen — hier auf eine Zeile PRO Rolle aufgefächert, damit sie zur
  // flachen ZuordenbarePerson-Form passt (wie holeZuordenbareFunktionstraeger).
  const [zuordenbareFunktionstraeger, ordnerEinsatzZahlen] = await Promise.all([
    holeZuordenbareFunktionstraeger(vereinId),
    holeOrdnerEinsatzZahlen(vereinId),
  ]);
  const zuordenbarePersonen = [
    ...zuordenbareFunktionstraeger,
    ...ordnerEinsatzZahlen.flatMap((p) =>
      p.rollen.map((rolle) => ({
        userId: p.userId,
        name: p.name,
        email: p.email,
        typ: rolle,
      }))
    ),
  ];

  const mannschaftenNachId = new Map(mannschaftsListe.map((m) => [m.id, m]));
  const eintraegeProTag = new Map<string, KalenderEintrag[]>();
  const mehrtaegigeEintraege: TurnierBalkenBearbeitbar[] = [];
  for (const t of termineDesMonats) {
    // Ein Turnier mit Ende an einem ANDEREN Kalendertag ist ein "Container",
    // der die ganze Spanne als Balken abdeckt (siehe MonatsKalender) — kein
    // Eintrag am Starttag mehr, sonst erschiene es doppelt. Eintägige
    // Turniere (kein Ende oder Ende am selben Tag) laufen unverändert durch
    // die normale Einzeltag-Anzeige.
    if (t.typ === "turnier" && t.ende && tagKey(t.ende) !== tagKey(t.start)) {
      mehrtaegigeEintraege.push({
        id: t.id,
        label: t.beschreibung ?? "Turnier",
        href: `/admin/termine/${t.id}`,
        startTag: tagKey(t.start),
        endTag: tagKey(t.ende),
        start: t.start,
        ende: t.ende,
        ort: t.ort,
        mannschaftId: t.mannschaftId,
        turnierVerantwortlicherId: t.turnierVerantwortlicherId,
      });
      continue;
    }

    const key = tagKey(t.start);
    const liste = eintraegeProTag.get(key) ?? [];
    const typLabel =
      t.typ === "rundenspiel"
        ? rundenspielTypLabel(t.pflichtspiel, t.freundschaftsTyp)
        : (TYP_LABEL[t.typ] ?? t.typ);
    const label = t.beschreibung ?? t.ort ?? typLabel;

    const eigeneZuordnungen = zuordnungen.filter((z) => z.terminId === t.id);
    const hatEigenenSchiri = eigeneZuordnungen.some(
      (z) => z.funktionstraegerTyp === "schiedsrichter"
    );
    const hatEigenenZeitnehmer = eigeneZuordnungen.some(
      (z) => z.funktionstraegerTyp === "zeitnehmer" || z.funktionstraegerTyp === "sekretaer"
    );
    // Ohne eigene Zuordnung, aber bereits von nuLiga/handball.net gemeldet
    // (siehe besetzungsDetails-Hinweise unten): dann ist die Rolle trotzdem
    // besetzt, nur eben (noch) nicht mit einem eigenen Funktionsträger
    // verknüpft — "Besetzung offen" wäre hier irreführend, der Verband/Gegner
    // hat längst jemanden benannt.
    const { externeSchiriAnzahl, externeZeitnehmerSekretaerAnzahl } =
      externeAnsetzungsAnzahlen(t, eigeneZuordnungen);

    const zuordenbar = BESETZUNGSRELEVANTE_TYPEN.includes(t.typ);
    const mannschaft = t.mannschaftId ? mannschaftenNachId.get(t.mannschaftId) : null;
    const zeitnehmerBedarf = verein
      ? bedarfFuer(
          verein,
          t.typ,
          "zeitnehmer",
          t.pflichtspiel,
          t.freundschaftsTyp,
          t.zeitnehmerBedarfOverride,
          mannschaftBedarfDeaktiviertFuer(mannschaft, "zeitnehmer")
        )
      : 0;
    const besetzungsStatus = zuordenbar && verein
      ? berechneBesetzung(
          eigeneZuordnungen,
          false,
          zeitnehmerBedarf,
          externeSchiriAnzahl,
          externeZeitnehmerSekretaerAnzahl
        )
      : null;
    const besetzung = besetzungsStatus
      ? istBesetzungVollstaendig(besetzungsStatus, t.typ, t.pflichtspiel)
        ? ("vollstaendig" as const)
        : ("offen" as const)
      : undefined;
    // Rollen, für die eine weitere Zuordnung ohnehin abgelehnt würde (siehe
    // zuordnen in admin/zuordnung/actions.ts, das dieselbe Grenze serverseitig
    // prüft) — im "Person wählen…"-Dropdown werden die passenden Optionen
    // dafür ausgegraut (siehe volleRollen in monats-kalender.tsx).
    const volleRollen: string[] = [];
    if (besetzungsStatus?.schiriVoll) volleRollen.push("schiedsrichter");
    if (besetzungsStatus?.zeitnehmerVoll) volleRollen.push("zeitnehmer");
    if (besetzungsStatus?.sekretaerVoll) volleRollen.push("sekretaer");

    const besetzungsDetails: {
      id: string;
      label: string;
      hinweis?: string;
      entfernbar?: boolean;
    }[] = [];
    for (const z of eigeneZuordnungen) {
      const label = `${ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}: ${
        z.name ?? z.externerName ?? z.email
      }${z.externerName && !z.email ? " (ohne Login)" : ""}`;
      // z.name ist bei "ohne Login"-Zuordnungen (kein Account) immer null —
      // ohne den Fallback auf externerName würde der Abgleich für diese
      // Personen grundsätzlich ins Leere laufen und fälschlich vor einer
      // Abweichung warnen, selbst wenn der Name eigentlich passt.
      const zugeordneterName = z.name ?? z.externerName;
      let hinweis: string | undefined;
      if (z.funktionstraegerTyp === "schiedsrichter") {
        // handball.net liefert volle Namen (siehe angesetzteNamenPassenZu)
        // und ist damit zuverlässiger als der nuLiga-Kürzel-Abgleich — bei
        // beiden gleichzeitig gesetzt (kommt praktisch nicht vor, ein Termin
        // stammt aus genau einer Quelle) gewinnt daher handball.net.
        if (t.handballNetSchiedsrichter) {
          hinweis = angesetzteNamenPassenZu(t.handballNetSchiedsrichter, zugeordneterName)
            ? `✓ passt zu handball.net: ${t.handballNetSchiedsrichter}`
            : `⚠ handball.net nennt: ${t.handballNetSchiedsrichter}`;
        } else if (t.nuligaSchiedsrichterKuerzel) {
          hinweis = schiedsrichterKuerzelPasstZu(t.nuligaSchiedsrichterKuerzel, zugeordneterName)
            ? `✓ passt zu nuLiga: ${t.nuligaSchiedsrichterKuerzel}`
            : `⚠ nuLiga nennt: ${t.nuligaSchiedsrichterKuerzel}`;
        }
      } else if (
        (z.funktionstraegerTyp === "zeitnehmer" || z.funktionstraegerTyp === "sekretaer") &&
        t.handballNetZeitnehmer
      ) {
        hinweis = angesetzteNamenPassenZu(t.handballNetZeitnehmer, zugeordneterName)
          ? `✓ passt zu handball.net: ${t.handballNetZeitnehmer}`
          : `⚠ handball.net nennt: ${t.handballNetZeitnehmer}`;
      } else if ((ORDNER_ROLLEN as readonly string[]).includes(z.funktionstraegerTyp)) {
        // Anders als bei Schiedsrichter/Zeitnehmer/Sekretär ist eine
        // Person hier bewusst NICHT auf eine der ORDNER_ROLLEN begrenzt
        // (siehe pruefeKeineOrdnerDoppelrolle in lib/ordnerwart.ts) — nur
        // noch ein Hinweis, kein Blockieren. Erkennung über E-Mail (bei
        // Konto) bzw. externerName (ohne Konto), da userId hier nicht mit
        // geladen wird.
        const andereRollen = eigeneZuordnungen.filter(
          (andere) =>
            andere.id !== z.id &&
            (ORDNER_ROLLEN as readonly string[]).includes(andere.funktionstraegerTyp) &&
            (z.email
              ? andere.email === z.email
              : !!z.externerName &&
                andere.externerName?.trim().toLowerCase() ===
                  z.externerName.trim().toLowerCase())
        );
        if (andereRollen.length > 0) {
          hinweis = `⚠ zusätzlich als ${[
            ...new Set(
              andereRollen.map((a) => ROLLE_LABEL[a.funktionstraegerTyp] ?? a.funktionstraegerTyp)
            ),
          ].join(", ")} eingetragen`;
        }
      }
      besetzungsDetails.push({ id: z.id, label, hinweis });
    }
    if (
      (t.handballNetSchiedsrichter || t.nuligaSchiedsrichterKuerzel) &&
      !hatEigenenSchiri
    ) {
      // Bei echten Ligaspielen ordnet der Verein ohnehin keinen
      // Schiedsrichter zu (siehe brauchtSchiedsrichterVomVerein) — der
      // Zusatz "(noch nicht zugeordnet)" suggeriert dort fälschlich eine
      // offene Aufgabe, obwohl die externe Ansetzung bereits die
      // vollständige Besetzung ist und intern nichts mehr zu tun bleibt.
      const nochNichtZugeordnet = brauchtSchiedsrichterVomVerein(t)
        ? " (noch nicht zugeordnet)"
        : "";
      besetzungsDetails.push(
        t.handballNetSchiedsrichter
          ? {
              id: `handball-net-schiedsrichter-${t.id}`,
              label: `handball.net-Ansetzung: ${t.handballNetSchiedsrichter}${nochNichtZugeordnet}`,
              entfernbar: false,
            }
          : {
              id: `nuliga-kuerzel-${t.id}`,
              label: `nuLiga-Ansetzung: ${t.nuligaSchiedsrichterKuerzel}${nochNichtZugeordnet}`,
              entfernbar: false,
            }
      );
    }
    if (t.handballNetZeitnehmer && !hatEigenenZeitnehmer) {
      besetzungsDetails.push({
        id: `handball-net-zeitnehmer-${t.id}`,
        label: `handball.net-Ansetzung: ${t.handballNetZeitnehmer} (noch nicht zugeordnet)`,
        entfernbar: false,
      });
    }

    // Für jede Rolle mit tatsächlichem Bedarf (siehe bedarfFuer in dienste.ts,
    // z.B. pro Mannschaft abgeschaltet oder in den Vereins-Einstellungen auf
    // 0) und ohne jede Zuordnung/externe Ansetzung eine eigene "offen"-Zeile
    // — sonst war eine unbesetzte Rolle im Kalender nur durch ihr Fehlen
    // erkennbar, nicht direkt als offener Punkt sichtbar.
    if (verein) {
      if (
        zuordenbar &&
        brauchtSchiedsrichterVomVerein(t) &&
        !hatEigenenSchiri &&
        !t.handballNetSchiedsrichter &&
        !t.nuligaSchiedsrichterKuerzel
      ) {
        besetzungsDetails.push({
          id: `offen-schiedsrichter-${t.id}`,
          label: "Schiedsrichter: offen",
          entfernbar: false,
        });
      }
      if (
        zuordenbar &&
        zeitnehmerBedarf > 0 &&
        !hatEigenenZeitnehmer &&
        !t.handballNetZeitnehmer
      ) {
        besetzungsDetails.push({
          id: `offen-zeitnehmer-${t.id}`,
          label: "Zeitnehmer/Sekretär: offen",
          entfernbar: false,
        });
      }
      for (const rolle of ORDNER_ROLLEN) {
        const vorhandeneAnzahl = eigeneZuordnungen.filter(
          (z) => z.funktionstraegerTyp === rolle
        ).length;
        // bedarfFuer liefert für nicht zutreffende Typen (z.B. turnier_spiel,
        // siehe Kommentar dort) bereits selbst 0 zurück — keine zusätzliche
        // Typ-Prüfung hier nötig.
        const bedarf = bedarfFuer(
          verein,
          t.typ,
          rolle,
          t.pflichtspiel,
          t.freundschaftsTyp,
          undefined,
          mannschaftBedarfDeaktiviertFuer(mannschaft, rolle)
        );
        // Wie bei schiriVoll/zeitnehmerVoll/sekretaerVoll oben: dieselbe
        // Grenze, die pruefeOrdnerBesetzungsgrenze serverseitig prüft (siehe
        // zuordnen in admin/zuordnung/actions.ts), hier gespiegelt, damit das
        // "Person wählen…"-Dropdown eine ohnehin abgelehnte Zuordnung gar
        // nicht erst anbietet.
        if (vorhandeneAnzahl >= bedarf) volleRollen.push(rolle);
        if (bedarf > 0 && vorhandeneAnzahl === 0) {
          besetzungsDetails.push({
            id: `offen-${rolle}-${t.id}`,
            label: `${ROLLE_LABEL[rolle]}: offen`,
            entfernbar: false,
          });
        }
      }
    }

    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label,
      typLabel,
      besetzung,
      zuordenbar,
      volleRollen,
      schiedsrichterZuordnenErlaubt: brauchtSchiedsrichterVomVerein(t),
      ort: t.ort,
      besetzungsDetails,
      mannschaftLabel: formatMannschaft(t),
      ergebnis: formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts),
      bearbeitenHref: BEARBEITBARE_TYPEN.includes(t.typ)
        ? `/admin/termine/${t.typ === "turnier_spiel" ? t.turnierId : t.id}`
        : undefined,
    });
    eintraegeProTag.set(key, liste);
  }

  return { eintraegeProTag, mehrtaegigeEintraege, mannschaftsListe, trainerListe, zuordenbarePersonen };
}
