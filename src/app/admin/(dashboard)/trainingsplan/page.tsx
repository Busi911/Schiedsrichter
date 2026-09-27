import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { hallen, mannschaften, trainingszeiten } from "@/db/schema";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingsplanGrid } from "@/components/trainingsplan-grid";

export default async function TrainingsplanPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [hallenListe, mannschaftenRoh, trainingszeitenListe] = await Promise.all([
    withTenant(vereinId, (tx) =>
      tx.query.hallen.findMany({
        where: eq(hallen.vereinId, vereinId),
        orderBy: (h, { asc }) => [asc(h.name)],
      })
    ),
    withTenant(vereinId, (tx) =>
      tx.query.mannschaften.findMany({ where: eq(mannschaften.vereinId, vereinId) })
    ),
    withTenant(vereinId, (tx) =>
      tx.query.trainingszeiten.findMany({
        where: eq(trainingszeiten.vereinId, vereinId),
      })
    ),
  ]);

  const mannschaftenListe = sortiereMannschaften(mannschaftenRoh).map((m) => ({
    id: m.id,
    label: m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Trainingsplan</h1>
        <p className="text-sm text-muted-foreground">
          Wöchentlich wiederkehrende Trainingszeiten je Halle planen — auf
          Desktop per Ziehen (Mannschaft auf einen Wochentag ziehen, Dauer an
          der unteren Kante anpassen), auf dem Handy über den
          Bearbeiten-Dialog. Gilt für jede Woche gleich, ohne Bezug zu einem
          konkreten Datum.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hallenbelegung</CardTitle>
          <CardDescription>
            Mehrere Trainings zur selben Zeit in derselben Halle sind
            möglich — z.B. wenn die Halle geteilt wird — und werden
            nebeneinander dargestellt statt als Konflikt behandelt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrainingsplanGrid
            hallen={hallenListe}
            mannschaften={mannschaftenListe}
            trainingszeiten={trainingszeitenListe}
          />
        </CardContent>
      </Card>
    </div>
  );
}
