import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { dienstBedarfSpeichern, nuligaEinstellungenSpeichern } from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{
    nuligaNeu?: string;
    nuligaAktualisiert?: string;
    nuligaEntfernt?: string;
    nuligaFehler?: string;
    nuligaDiagnose?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const nuligaErgebnis = await searchParams;

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Einstellungen</h1>
      </div>

      {nuligaErgebnis.nuligaNeu !== undefined && (
        <Alert
          variant={nuligaErgebnis.nuligaFehler ? "destructive" : "default"}
          className="max-w-md"
        >
          <AlertTitle>
            nuLiga-Sync: {nuligaErgebnis.nuligaNeu} neu,{" "}
            {nuligaErgebnis.nuligaAktualisiert ?? 0} aktualisiert,{" "}
            {nuligaErgebnis.nuligaEntfernt ?? 0} entfernt
          </AlertTitle>
          {(nuligaErgebnis.nuligaFehler || nuligaErgebnis.nuligaDiagnose) && (
            <AlertDescription>
              {nuligaErgebnis.nuligaFehler?.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
              {nuligaErgebnis.nuligaDiagnose && (
                <p className="text-xs text-muted-foreground">
                  {nuligaErgebnis.nuligaDiagnose}
                </p>
              )}
            </AlertDescription>
          )}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dienste-Bedarf pro Termin</CardTitle>
            <CardDescription>
              Wie viele Ordner-, Kioskdienst- und Zeitnehmer/Sekretär-Kräfte pro
              Freundschaftsspiel, Turnier bzw. Rundenspiel benötigt werden.
              Sobald diese Anzahl erreicht ist, können sich weitere
              Interessenten nicht mehr anmelden. Gilt nicht für Termine aus dem
              ICS-Feed (das sind die persönlichen Einsätze der Schiedsrichter).
              Zeitnehmer und Sekretär sind dabei jeweils eigene Rollen mit
              fest max. einer Person — der hier eingetragene Bedarf zählt
              beide zusammen (z.B. 2 = ein Zeitnehmer UND ein Sekretär).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={dienstBedarfSpeichern} className="flex flex-col gap-5">
              <fieldset
                disabled={!session.user.istAdmin}
                className="flex flex-col gap-2"
              >
                <legend className="mb-1 text-sm font-medium">Freundschaftsspiele</legend>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="testspielOrdnerBedarf" className="font-normal">
                    Ordner
                  </Label>
                  <Input
                    id="testspielOrdnerBedarf"
                    type="number"
                    name="testspielOrdnerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielOrdnerBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="testspielKioskdienstBedarf"
                    className="font-normal"
                  >
                    Kioskdienst
                  </Label>
                  <Input
                    id="testspielKioskdienstBedarf"
                    type="number"
                    name="testspielKioskdienstBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielKioskdienstBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="testspielZeitnehmerBedarf"
                    className="font-normal"
                  >
                    Zeitnehmer/Sekretär
                  </Label>
                  <Input
                    id="testspielZeitnehmerBedarf"
                    type="number"
                    name="testspielZeitnehmerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielZeitnehmerBedarf ?? 1}
                    className="w-20"
                  />
                </div>
              </fieldset>

              <fieldset
                disabled={!session.user.istAdmin}
                className="flex flex-col gap-2"
              >
                <legend className="mb-1 text-sm font-medium">Turniere</legend>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="turnierOrdnerBedarf" className="font-normal">
                    Ordner
                  </Label>
                  <Input
                    id="turnierOrdnerBedarf"
                    type="number"
                    name="turnierOrdnerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierOrdnerBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="turnierKioskdienstBedarf"
                    className="font-normal"
                  >
                    Kioskdienst
                  </Label>
                  <Input
                    id="turnierKioskdienstBedarf"
                    type="number"
                    name="turnierKioskdienstBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierKioskdienstBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="turnierZeitnehmerBedarf"
                    className="font-normal"
                  >
                    Zeitnehmer/Sekretär
                  </Label>
                  <Input
                    id="turnierZeitnehmerBedarf"
                    type="number"
                    name="turnierZeitnehmerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierZeitnehmerBedarf ?? 1}
                    className="w-20"
                  />
                </div>
              </fieldset>

              <fieldset
                disabled={!session.user.istAdmin}
                className="flex flex-col gap-2"
              >
                <legend className="mb-1 text-sm font-medium">Hallenspielplan</legend>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rundenspielOrdnerBedarf" className="font-normal">
                    Ordner
                  </Label>
                  <Input
                    id="rundenspielOrdnerBedarf"
                    type="number"
                    name="rundenspielOrdnerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielOrdnerBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="rundenspielKioskdienstBedarf"
                    className="font-normal"
                  >
                    Kioskdienst
                  </Label>
                  <Input
                    id="rundenspielKioskdienstBedarf"
                    type="number"
                    name="rundenspielKioskdienstBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielKioskdienstBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="rundenspielZeitnehmerBedarf"
                    className="font-normal"
                  >
                    Zeitnehmer/Sekretär
                  </Label>
                  <Input
                    id="rundenspielZeitnehmerBedarf"
                    type="number"
                    name="rundenspielZeitnehmerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielZeitnehmerBedarf ?? 1}
                    className="w-20"
                  />
                </div>
              </fieldset>

              {session.user.istAdmin && (
                <Button type="submit" className="w-full">
                  Speichern
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>nuLiga Automatischer Import</CardTitle>
            <CardDescription>
              Bis zu drei Hallen-IDs eintragen (leere Felder werden
              übersprungen) — dieselben Angaben wie im bisherigen manuellen
              Export-Workflow. Bei aktiviertem Import lädt der Verein montags
              und donnerstags automatisch neue Spiele in den Hallenspielplan; nach dem
              Speichern läuft sofort ein erster Sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Woher bekomme ich die Hallen-ID?
              </p>
              <p className="mt-1">
                Die ID steht nicht sichtbar auf der Seite, sondern nur in der
                Adresszeile des Browsers: Sucht eure Halle im Spielbetrieb des
                Verbands (z.B. auf{" "}
                <a
                  href="https://hhv-handball.liga.nu"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  hhv-handball.liga.nu
                </a>{" "}
                unter „Hallen“ oder „Spielbetrieb“), öffnet die Hallenseite und
                lest die Zahl hinter <code>location=</code> in der URL ab —
                z.B. bei{" "}
                <code>...courtInfo?federation=HHV&amp;location=30402</code>{" "}
                ist die Hallen-ID <code>30402</code>.
              </p>
            </div>
            <form
              action={nuligaEinstellungenSpeichern}
              className="flex flex-col gap-4"
            >
            <fieldset
              disabled={!session.user.istAdmin}
              className="contents"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaHalle1Id">Halle 1</Label>
                <Input
                  id="nuligaHalle1Id"
                  name="nuligaHalle1Id"
                  inputMode="numeric"
                  placeholder="z.B. 30402"
                  defaultValue={verein?.nuligaHalle1Id ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaHalle2Id">Halle 2</Label>
                <Input
                  id="nuligaHalle2Id"
                  name="nuligaHalle2Id"
                  inputMode="numeric"
                  placeholder="optional"
                  defaultValue={verein?.nuligaHalle2Id ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaHalle3Id">Halle 3</Label>
                <Input
                  id="nuligaHalle3Id"
                  name="nuligaHalle3Id"
                  inputMode="numeric"
                  placeholder="optional"
                  defaultValue={verein?.nuligaHalle3Id ?? ""}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="nuligaAutoImportAktiviert" className="font-normal">
                  Automatischer Import aktiv (Mo + Do)
                </Label>
                <Switch
                  key={String(verein?.nuligaAutoImportAktiviert ?? false)}
                  id="nuligaAutoImportAktiviert"
                  name="nuligaAutoImportAktiviert"
                  defaultChecked={verein?.nuligaAutoImportAktiviert ?? false}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="rundenspielAenderungenBenachrichtigungAktiviert"
                  className="font-normal"
                >
                  Benachrichtigung bei verlegten Spielen/neuen Ergebnissen
                </Label>
                <Switch
                  key={String(
                    verein?.rundenspielAenderungenBenachrichtigungAktiviert ?? false
                  )}
                  id="rundenspielAenderungenBenachrichtigungAktiviert"
                  name="rundenspielAenderungenBenachrichtigungAktiviert"
                  defaultChecked={
                    verein?.rundenspielAenderungenBenachrichtigungAktiviert ?? false
                  }
                />
              </div>
            </fieldset>
              {session.user.istAdmin && (
                <SubmitButton
                  className="w-full"
                  pendingText="Synchronisiert…"
                >
                  Speichern{verein?.nuligaAutoImportAktiviert ? " & synchronisieren" : ""}
                </SubmitButton>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
