import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { dienstBedarfSpeichern } from "./actions";
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

export default async function EinstellungenPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Einstellungen</h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Dienste-Bedarf pro Termin</CardTitle>
          <CardDescription>
            Wie viele Ordner und Kioskdienst-Kräfte pro Testspiel bzw.
            Turnier benötigt werden. Sobald diese Anzahl erreicht ist, können
            sich weitere Interessenten nicht mehr anmelden. Gilt nicht für
            Termine aus dem ICS-Feed (das sind die persönlichen Einsätze der
            Schiedsrichter).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={dienstBedarfSpeichern} className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Testspiele</legend>
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
            </fieldset>

            <fieldset className="flex flex-col gap-2">
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
            </fieldset>

            <Button type="submit" className="w-full">
              Speichern
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
