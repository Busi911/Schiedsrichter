import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, terminZuordnungen, users } from "@/db/schema";
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

// Nur diese Typen brauchen eine Schiri-/Zeitnehmer-/Sekretär-Zuordnung —
// der Turnier-Container selbst wird pro Einzelspiel besetzt (siehe
// src/lib/zuordnung.ts).
const BESETZUNGSRELEVANTE_TYPEN = ["spiel_ics", "testspiel", "turnier_spiel"];

function formatZeit(d: Date) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);
}

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

  const [termineDesMonats, zuordnungen] = await withTenant(vereinId, async (tx) => {
    const termineDesMonats = await tx
      .select({
        id: termine.id,
        typ: termine.typ,
        start: termine.start,
        ort: termine.ort,
        beschreibung: termine.beschreibung,
        schiedsrichterName: users.name,
        schiedsrichterEmail: users.email,
      })
      .from(termine)
      .leftJoin(users, eq(termine.icsSchiedsrichterId, users.id))
      .where(
        and(eq(termine.vereinId, vereinId), gte(termine.start, von), lte(termine.start, bis))
      );

    const terminIds = termineDesMonats.map((t) => t.id);
    const zuordnungen = terminIds.length
      ? await tx
          .select({
            terminId: terminZuordnungen.terminId,
            funktionstraegerTyp: terminZuordnungen.funktionstraegerTyp,
          })
          .from(terminZuordnungen)
          .where(inArray(terminZuordnungen.terminId, terminIds))
      : [];

    return [termineDesMonats, zuordnungen];
  });

  const eintraegeProTag = new Map<string, KalenderEintrag[]>();
  for (const t of termineDesMonats) {
    const key = tagKey(t.start);
    const liste = eintraegeProTag.get(key) ?? [];
    const label =
      t.beschreibung ??
      t.ort ??
      (t.typ === "spiel_ics" ? t.schiedsrichterName ?? t.schiedsrichterEmail ?? "Spiel" : TYP_LABEL[t.typ]);

    const besetzung = BESETZUNGSRELEVANTE_TYPEN.includes(t.typ)
      ? berechneBesetzung(
          zuordnungen.filter((z) => z.terminId === t.id),
          t.typ === "spiel_ics" && !!t.schiedsrichterEmail
        ).vollstaendig
        ? ("vollstaendig" as const)
        : ("offen" as const)
      : undefined;

    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label,
      typLabel: TYP_LABEL[t.typ] ?? t.typ,
      besetzung,
    });
    eintraegeProTag.set(key, liste);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Kalender</h1>
        <p className="text-sm text-muted-foreground">
          Alle Termine des Vereins — Spiele aus dem ICS-Feed sowie Testspiele/Turniere.
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
            basisPfad="/admin/kalender"
          />
        </CardContent>
      </Card>
    </div>
  );
}
