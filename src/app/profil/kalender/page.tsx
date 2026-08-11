import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import Link from "next/link";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, termine, terminZuordnungen } from "@/db/schema";
import { monatsBereich, parseMonatParam, tagKey } from "@/lib/kalender";
import { berechneBesetzung } from "@/lib/besetzung";
import { MonatsKalender, type KalenderEintrag } from "@/components/monats-kalender";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
};

const BESETZUNGSRELEVANTE_TYPEN = ["spiel_ics", "testspiel", "turnier_spiel"];

function formatZeit(d: Date) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);
}

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
        hatIcsSchiedsrichter: termine.icsSchiedsrichterId,
      })
      .from(termine)
      .where(
        and(
          eq(termine.vereinId, vereinId),
          gte(termine.start, von),
          lte(termine.start, bis),
          or(...bedingungen)
        )
      );

    const terminIds = termineDesMonats.map((t) => t.id);
    const alleZuordnungen = terminIds.length
      ? await tx
          .select({
            terminId: terminZuordnungen.terminId,
            funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
          })
          .from(terminZuordnungen)
          .where(inArray(terminZuordnungen.terminId, terminIds))
      : [];

    return [termineDesMonats, alleZuordnungen];
  });

  const eintraegeProTag = new Map<string, KalenderEintrag[]>();
  for (const t of termineDesMonats) {
    const key = tagKey(t.start);
    const liste = eintraegeProTag.get(key) ?? [];
    const besetzung = BESETZUNGSRELEVANTE_TYPEN.includes(t.typ)
      ? berechneBesetzung(
          alleZuordnungen.filter((z) => z.terminId === t.id),
          !!t.hatIcsSchiedsrichter
        ).vollstaendig
        ? ("vollstaendig" as const)
        : ("offen" as const)
      : undefined;
    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label: t.beschreibung ?? t.ort ?? TYP_LABEL[t.typ] ?? t.typ,
      typLabel: TYP_LABEL[t.typ] ?? t.typ,
      besetzung,
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
