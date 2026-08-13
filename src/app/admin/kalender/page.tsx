import { and, asc, eq, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { monatsBereich, parseMonatParam, tagKey } from "@/lib/kalender";
import { formatMannschaft } from "@/lib/dashboard";
import { berechneBesetzung, istBesetzungVollstaendig } from "@/lib/besetzung";
import { bedarfFuer } from "@/lib/dienste";
import { holeZuordenbareFunktionstraeger } from "@/lib/zuordnung";
import { schiedsrichterKuerzelPasstZu } from "@/lib/rundenspiel-import";
import {
  MonatsKalender,
  type KalenderEintrag,
  type TurnierBalkenBearbeitbar,
} from "@/components/monats-kalender";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatZeit } from "@/lib/format";
import { formatErgebnis, rundenspielTypLabel } from "@/lib/termin-label";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Freundschaftsspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
};

const ROLLE_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

// Nur diese Typen brauchen eine Schiri-/Zeitnehmer-/Sekretär-Zuordnung —
// der Turnier-Container selbst wird pro Einzelspiel besetzt (siehe
// src/lib/zuordnung.ts). Rundenspiele brauchen nur Zeitnehmer/Sekretär
// (siehe istBesetzungVollstaendig in src/lib/besetzung.ts).
const BESETZUNGSRELEVANTE_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier_spiel",
  "rundenspiel",
];
// Nur manuell angelegte Termine (Testspiel/Turnier/Turnierspiel) sind
// bearbeitbar — ICS-Feed- und Rundenspiel-Import-Termine werden von ihrer
// jeweiligen Quelle verwaltet.
const BEARBEITBARE_TYPEN = ["testspiel", "turnier", "turnier_spiel"];

export default async function AdminKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { monat } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);
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
          mannschaftId: termine.mannschaftId,
          mannschaftName: mannschaften.name,
          mannschaftAltersklasse: mannschaften.altersklasse,
          kategorie: termine.kategorie,
          turnierVerantwortlicherId: termine.turnierVerantwortlicherId,
          schiedsrichterName: users.name,
          schiedsrichterEmail: users.email,
        })
        .from(termine)
        .leftJoin(users, eq(termine.icsSchiedsrichterId, users.id))
        .leftJoin(mannschaften, eq(termine.mannschaftId, mannschaften.id))
        .where(
          and(
            eq(termine.vereinId, vereinId),
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

      const mannschaftsListe = await tx.query.mannschaften.findMany({
        where: eq(mannschaften.vereinId, vereinId),
        orderBy: (m, { asc }) => [asc(m.name)],
      });

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

  const zuordenbarePersonen = await holeZuordenbareFunktionstraeger(vereinId);

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
        : TYP_LABEL[t.typ] ?? t.typ;
    const label =
      t.beschreibung ??
      t.ort ??
      (t.typ === "spiel_ics" ? t.schiedsrichterName ?? t.schiedsrichterEmail ?? "Spiel" : typLabel);

    const eigeneZuordnungen = zuordnungen.filter((z) => z.terminId === t.id);
    const zuordenbar = BESETZUNGSRELEVANTE_TYPEN.includes(t.typ);
    const besetzung = zuordenbar && verein
      ? istBesetzungVollstaendig(
          berechneBesetzung(
            eigeneZuordnungen,
            t.typ === "spiel_ics" && !!t.schiedsrichterEmail,
            bedarfFuer(verein, t.typ, "zeitnehmer", t.pflichtspiel, t.freundschaftsTyp),
            verein.zeitnehmerSekretaerMax
          ),
          t.typ,
          t.pflichtspiel
        )
        ? ("vollstaendig" as const)
        : ("offen" as const)
      : undefined;

    const besetzungsDetails: { id: string; label: string; hinweis?: string }[] = [];
    if (t.typ === "spiel_ics" && t.schiedsrichterEmail) {
      besetzungsDetails.push({
        id: `ics-${t.id}`,
        label: `Schiedsrichter: ${t.schiedsrichterName ?? t.schiedsrichterEmail}`,
      });
    }
    for (const z of eigeneZuordnungen) {
      const label = `${ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}: ${
        z.name ?? z.externerName ?? z.email
      }${z.externerName && !z.email ? " (ohne Login)" : ""}`;
      let hinweis: string | undefined;
      if (z.funktionstraegerTyp === "schiedsrichter" && t.nuligaSchiedsrichterKuerzel) {
        // z.name ist bei "ohne Login"-Zuordnungen (kein Account) immer
        // null — ohne den Fallback auf externerName würde der Abgleich für
        // diese Personen grundsätzlich ins Leere laufen und fälschlich vor
        // einer Abweichung warnen, selbst wenn der Name eigentlich passt.
        hinweis = schiedsrichterKuerzelPasstZu(
          t.nuligaSchiedsrichterKuerzel,
          z.name ?? z.externerName
        )
          ? `✓ passt zu nuLiga: ${t.nuligaSchiedsrichterKuerzel}`
          : `⚠ nuLiga nennt: ${t.nuligaSchiedsrichterKuerzel}`;
      }
      besetzungsDetails.push({ id: z.id, label, hinweis });
    }
    if (
      t.nuligaSchiedsrichterKuerzel &&
      !eigeneZuordnungen.some((z) => z.funktionstraegerTyp === "schiedsrichter")
    ) {
      besetzungsDetails.push({
        id: `nuliga-kuerzel-${t.id}`,
        label: `nuLiga-Ansetzung: ${t.nuligaSchiedsrichterKuerzel} (noch nicht zugeordnet)`,
      });
    }

    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label,
      typLabel,
      besetzung,
      zuordenbar,
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Kalender</h1>
        <p className="text-sm text-muted-foreground">
          Alle Termine des Vereins — Spiele aus dem ICS-Feed sowie Freundschaftsspiele/Turniere. Zum
          Anschauen der Details auf einen Termin klicken.
          <span className="ml-2 inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-emerald-500" /> Besetzung
            vollständig
          </span>
          <span className="ml-3 inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-amber-500" /> Besetzung offen
          </span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Übersicht</CardTitle>
        </CardHeader>
        <CardContent>
          <MonatsKalender
            jahr={jahr}
            monatNull={monatNull}
            eintraegeProTag={eintraegeProTag}
            mehrtaegigeEintraege={mehrtaegigeEintraege}
            mannschaftsListe={mannschaftsListe}
            trainerListe={trainerListe}
            zuordenbarePersonen={zuordenbarePersonen}
            basisPfad="/admin/kalender"
          />
        </CardContent>
      </Card>
    </div>
  );
}
