import { and, eq, gte, lte } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { termine, users } from "@/db/schema";
import { monatsBereich, parseMonatParam, tagKey } from "@/lib/kalender";
import { MonatsKalender, type KalenderEintrag } from "@/components/monats-kalender";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
};

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

  const termineDesMonats = await withTenant(vereinId, (tx) =>
    tx
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
      )
  );

  const eintraegeProTag = new Map<string, KalenderEintrag[]>();
  for (const t of termineDesMonats) {
    const key = tagKey(t.start);
    const liste = eintraegeProTag.get(key) ?? [];
    const label =
      t.beschreibung ??
      t.ort ??
      (t.typ === "spiel_ics" ? t.schiedsrichterName ?? t.schiedsrichterEmail ?? "Spiel" : TYP_LABEL[t.typ]);
    liste.push({
      id: t.id,
      zeit: formatZeit(t.start),
      label,
      typLabel: TYP_LABEL[t.typ] ?? t.typ,
    });
    eintraegeProTag.set(key, liste);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Kalender</h1>
        <p className="text-sm text-muted-foreground">
          Alle Termine des Vereins — Spiele aus dem ICS-Feed sowie Testspiele/Turniere.
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
