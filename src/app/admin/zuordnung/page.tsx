import { requireAdmin } from "@/lib/session";
import {
  holeTermineMitZuordnungen,
  holeZuordenbareFunktionstraeger,
} from "@/lib/zuordnung";
import { zuordnen, zuordnungEntfernen } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LabeledSelect } from "@/components/labeled-select";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  // Nicht über das Zuordnen-Formular wählbar, können aber als
  // Selbst-Anmeldung (Ordner/Kioskdienst) in derselben Liste auftauchen.
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function ZuordnungPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [termine, personen] = await Promise.all([
    holeTermineMitZuordnungen(vereinId),
    holeZuordenbareFunktionstraeger(vereinId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Spielzuordnung</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Schiedsrichter aus dem ICS-Feed sind bereits automatisch zugeordnet.
          Hier zusätzlich Zeitnehmer, Sekretäre (oder weitere Schiedsrichter,
          z.B. für Testspiele/Turniere) zu anstehenden Terminen zuordnen.
        </p>
      </div>

      <div className="grid gap-4">
        {termine.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Keine anstehenden Termine.
          </p>
        )}
        {termine.map((termin) => (
          <Card key={termin.id} className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base">
                {formatDateTime(termin.start)} ·{" "}
                {TYP_LABEL[termin.typ] ?? termin.typ}
                {termin.ort ? ` · ${termin.ort}` : ""}
              </CardTitle>
              {termin.beschreibung && (
                <CardDescription>{termin.beschreibung}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {termin.icsSchiedsrichter && (
                  <Badge variant="outline">
                    Schiedsrichter (ICS):{" "}
                    {termin.icsSchiedsrichter.name ??
                      termin.icsSchiedsrichter.email}
                  </Badge>
                )}
                {termin.zuordnungen.length === 0 &&
                  !termin.icsSchiedsrichter && (
                    <p className="text-sm text-muted-foreground">
                      Noch niemand zugeordnet.
                    </p>
                  )}
                {termin.zuordnungen.map((z) => (
                  <span
                    key={z.id}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
                  >
                    <span className="font-medium">
                      {TYP_LABEL[z.funktionstraegerTyp] ??
                        z.funktionstraegerTyp}
                      :
                    </span>{" "}
                    {z.name ?? z.email}
                    {z.quelle === "selbst_angemeldet" && " (selbst angemeldet)"}
                    <form action={zuordnungEntfernen}>
                      <input type="hidden" name="zuordnungId" value={z.id} />
                      <button
                        type="submit"
                        className="ml-1 text-muted-foreground underline"
                      >
                        Entfernen
                      </button>
                    </form>
                  </span>
                ))}
              </div>

              <form action={zuordnen} className="flex items-center gap-2">
                <input type="hidden" name="terminId" value={termin.id} />
                <div className="w-56">
                  <LabeledSelect
                    name="personTyp"
                    placeholder="Person wählen…"
                    required
                    options={personen.map((p) => ({
                      value: `${p.userId}|${p.typ}`,
                      label: `${p.name ?? p.email} (${TYP_LABEL[p.typ] ?? p.typ})`,
                    }))}
                  />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  Zuordnen
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
