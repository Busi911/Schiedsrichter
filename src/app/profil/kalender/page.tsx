import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen, users } from "@/db/schema";
import { monatsBereich, parseMonatParam, tagKey } from "@/lib/kalender";
import { berechneBesetzung, istBesetzungVollstaendig } from "@/lib/besetzung";
import { MonatsKalender, type KalenderEintrag } from "@/components/monats-kalender";
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

const BESETZUNGSRELEVANTE_TYPEN = [
  "spiel_ics",
  "testspiel",
  "turnier_spiel",
  "rundenspiel",
];

export default async function ProfilKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;
  const { monat } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);
  const { von, bis } = monatsBereich(jahr, monatNull);

  const [termineDesMonats, alleZuordnungen] = await withTenant(vereinId, async (tx) => {
    const eigeneRollen = await tx.query.funktionstraegerRollen.findMany({
      where: eq(funktionstraegerRollen.userId, userId),
    });
    const mannschaftIds = eigeneRollen
      .filter((r) => r.typ === "trainer" && r.mannschaftId)
      .map((r) => r.mannschaftId!);

    const eigeneZuordnungen = await tx.query.terminZuordnungen.findMany({
      where: eq(terminZuordnungen.userId, userId),
    });
    const zugeordneteTerminIds = eigeneZuordnungen.map((z) => z.terminId);

    const bedingungen = [eq(termine.icsSchiedsrichterId, userId)];
    if (zugeordneteTerminIds.length) {
      bedingungen.push(inArray(termine.id, zugeordneteTerminIds));
    }
    if (mannschaftIds.length) {
      bedingungen.push(inArray(termine.mannschaftId, mannschaftIds));
    }

    const termineDesMonats = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        start: termine.start,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        pflichtspiel: termine.pflichtspiel,
        hatIcsSchiedsrichter: termine.icsSchiedsrichterId,
        ergebnisHeim: termine.ergebnisHeim,
        ergebnisAuswaerts: termine.ergebnisAuswaerts,
      })
      .from(termine)
      .where(
        and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, von),
          lte(termine.start, bis),
          or(...bedingungen)
        )
      )
      .orderBy(asc(termine.start));

    const terminIds = termineDesMonats.map((t) => t.id);
    const alleZuordnungen = terminIds.length
      ? await tx
          .select({
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

    return [termineDesMonats, alleZuordnungen];
  });

  const eintraegeProTag = new Map<string, KalenderEintrag[]>();
  for (const t of termineDesMonats) {
    const key = tagKey(t.start);
    const liste = eintraegeProTag.get(key) ?? [];
    const eigeneZuordnungen = alleZuordnungen.filter((z) => z.terminId === t.id);
    const besetzung = BESETZUNGSRELEVANTE_TYPEN.includes(t.typ)
      ? istBesetzungVollstaendig(
          berechneBesetzung(eigeneZuordnungen, !!t.hatIcsSchiedsrichter),
          t.typ
        )
        ? ("vollstaendig" as const)
        : ("offen" as const)
      : undefined;
    const besetzungsDetails = eigeneZuordnungen.map(
      (z) =>
        `${ROLLE_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}: ${
          z.name ?? z.externerName ?? z.email
        }${z.externerName && !z.email ? " (ohne Login)" : ""}`
    );
    const typLabel =
      t.typ === "rundenspiel" ? rundenspielTypLabel(t.pflichtspiel) : TYP_LABEL[t.typ] ?? t.typ;
    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label: t.beschreibung ?? t.ort ?? typLabel,
      typLabel,
      besetzung,
      ort: t.ort,
      besetzungsDetails,
      ergebnis: formatErgebnis(t.ergebnisHeim, t.ergebnisAuswaerts),
    });
    eintraegeProTag.set(key, liste);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <Link href="/profil" className="text-sm text-muted-foreground underline">
          ← Zurück zu meinem Profil
        </Link>
        <h1 className="font-heading text-2xl font-semibold">Mein Kalender</h1>
        <p className="text-sm text-muted-foreground">
          Alle Termine, bei denen du als Schiedsrichter, Zeitnehmer, Sekretär, Ordner,
          Kioskdienst oder Trainer beteiligt bist.
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
            basisPfad="/profil/kalender"
          />
        </CardContent>
      </Card>
    </div>
  );
}
