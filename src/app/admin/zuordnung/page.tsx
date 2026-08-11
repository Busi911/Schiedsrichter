import { requireAdmin } from "@/lib/session";
import {
  holeTermineMitZuordnungen,
  holeZuordenbareFunktionstraeger,
  ZUORDENBARE_TYPEN,
} from "@/lib/zuordnung";
import { berechneBesetzung, istBesetzungVollstaendig } from "@/lib/besetzung";
import { externeZuordnung, zuordnen, zuordnungEntfernen } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LabeledSelect } from "@/components/labeled-select";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
  turnier_spiel: "Turnierspiel",
  rundenspiel: "Rundenspiel",
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  // Nicht über das Zuordnen-Formular wählbar, können aber als
  // Selbst-Anmeldung (Ordner/Kioskdienst) in derselben Liste auftauchen.
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

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
          Pflicht: mind. 1 Schiedsrichter (max. 2 als Gespann) und mind. 1
          Zeitnehmer oder Sekretär (max. 2).
        </p>
      </div>

      <div className="grid gap-4">
        {termine.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Keine anstehenden Termine.
          </p>
        )}
        {termine.map((termin) => {
          const besetzung = berechneBesetzung(
            termin.zuordnungen,
            !!termin.icsSchiedsrichter
          );
          const vollstaendig = istBesetzungVollstaendig(besetzung, termin.typ);
          const istRundenspiel = termin.typ === "rundenspiel";
          return (
            <Card key={termin.id} className="max-w-2xl">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {formatDateTime(termin.start)} ·{" "}
                  {TYP_LABEL[termin.typ] ?? termin.typ}
                  {termin.ort ? ` · ${termin.ort}` : ""}
                  <Badge variant={vollstaendig ? "secondary" : "outline"}>
                    {vollstaendig ? "Pflicht erfüllt" : "Besetzung offen"}
                  </Badge>
                </CardTitle>
                {termin.beschreibung && (
                  <CardDescription>{termin.beschreibung}</CardDescription>
                )}
                <CardDescription>
                  {!istRundenspiel && (
                    <>
                      Schiedsrichter {besetzung.schiriAnzahl}/2
                      {besetzung.schiriErfuellt ? "" : " · fehlt"} ·{" "}
                    </>
                  )}
                  Zeitnehmer/Sekretär {besetzung.zeitnehmerSekretaerAnzahl}/2
                  {besetzung.zeitnehmerSekretaerErfuellt ? "" : " · fehlt"}
                  {istRundenspiel &&
                    " (Schiedsrichter kommt vom Verband, nicht hier zugeordnet)"}
                </CardDescription>
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
                      {z.name ?? z.externerName ?? z.email}
                      {z.externerName && !z.userId && " (ohne Login)"}
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

                <form
                  action={externeZuordnung}
                  className="flex flex-wrap items-center gap-2 border-t pt-3"
                >
                  <input type="hidden" name="terminId" value={termin.id} />
                  <Input
                    name="name"
                    placeholder="Name (ohne Login, z.B. Gast-Schiri)"
                    required
                    className="h-8 w-56"
                  />
                  <div className="w-40">
                    <LabeledSelect
                      name="rolle"
                      placeholder="Rolle…"
                      required
                      options={ZUORDENBARE_TYPEN.map((typ) => ({
                        value: typ,
                        label: TYP_LABEL[typ] ?? typ,
                      }))}
                    />
                  </div>
                  <Button type="submit" variant="ghost" size="sm">
                    Ohne Login zuordnen
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  Personen ohne Login bekommen keine Benachrichtigung, da es
                  keinen Zugang/keine E-Mail gibt.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
