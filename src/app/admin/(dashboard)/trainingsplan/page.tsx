import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { hallen, mannschaften, trainingszeiten, vereine } from "@/db/schema";
import { sortiereMannschaften } from "@/lib/mannschaft-sortierung";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { TrainingsplanGrid } from "@/components/trainingsplan-grid";
import { trainingsplanZeitfensterSpeichern } from "./actions";

const STUNDEN_OPTIONEN = Array.from({ length: 25 }, (_, h) => h);

// Gleiche Klassen wie SELECT_KLASSE in funktionstraeger-tabelle.tsx, damit
// dieses native <select> optisch nicht von den übrigen im Admin-Bereich
// abweicht.
const SELECT_KLASSE =
  "h-8 w-24 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function TrainingsplanPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [verein, hallenListe, mannschaftenRoh, trainingszeitenListe] = await Promise.all([
    withTenant(vereinId, (tx) =>
      tx.query.vereine.findFirst({
        where: eq(vereine.id, vereinId),
        columns: { trainingsplanStartMinuten: true, trainingsplanEndMinuten: true },
      })
    ),
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

  const startStunde = (verein?.trainingsplanStartMinuten ?? 7 * 60) / 60;
  const endStunde = (verein?.trainingsplanEndMinuten ?? 22 * 60) / 60;

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
          <CardTitle className="text-base">Sichtbarer Zeitraum</CardTitle>
          <CardDescription>
            Von wann bis wann das Wochenraster unten Zeiten anzeigt — schränkt
            das Raster auf den tatsächlichen Trainingsbetrieb ein, statt es
            unnötig lang darzustellen. Bereits angelegte Trainingszeiten
            außerhalb dieses Fensters bleiben bestehen, werden im Raster aber
            am Rand abgeschnitten dargestellt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={trainingsplanZeitfensterSpeichern}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trainingsplan-start-stunde">Von</Label>
              <select
                id="trainingsplan-start-stunde"
                name="startStunde"
                defaultValue={startStunde}
                className={SELECT_KLASSE}
              >
                {STUNDEN_OPTIONEN.slice(0, 24).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trainingsplan-end-stunde">Bis</Label>
              <select
                id="trainingsplan-end-stunde"
                name="endStunde"
                defaultValue={endStunde}
                className={SELECT_KLASSE}
              >
                {STUNDEN_OPTIONEN.slice(1).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton size="sm" variant="outline">
              Speichern
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

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
            gridStartMinuten={verein?.trainingsplanStartMinuten ?? 7 * 60}
            gridEndMinuten={verein?.trainingsplanEndMinuten ?? 22 * 60}
          />
        </CardContent>
      </Card>
    </div>
  );
}
