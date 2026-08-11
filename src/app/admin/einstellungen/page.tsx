import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { dienstBedarfSpeichern } from "./actions";

export default async function EinstellungenPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Einstellungen</h1>

      <section className="max-w-md">
        <h2 className="font-medium">Dienste-Bedarf pro Termin</h2>
        <p className="mt-1 text-sm text-gray-600">
          Wie viele Ordner und Kioskdienst-Kräfte pro Testspiel bzw. Turnier
          benötigt werden. Sobald diese Anzahl erreicht ist, können sich
          weitere Interessenten nicht mehr anmelden. Gilt nicht für Termine
          aus dem ICS-Feed (das sind die persönlichen Einsätze der
          Schiedsrichter).
        </p>

        <form
          action={dienstBedarfSpeichern}
          className="mt-4 flex flex-col gap-4"
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Testspiele</legend>
            <label className="flex items-center justify-between gap-3 text-sm">
              Ordner
              <input
                type="number"
                name="testspielOrdnerBedarf"
                min="0"
                step="1"
                defaultValue={verein?.testspielOrdnerBedarf ?? 0}
                className="w-20 rounded border px-2 py-1"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Kioskdienst
              <input
                type="number"
                name="testspielKioskdienstBedarf"
                min="0"
                step="1"
                defaultValue={verein?.testspielKioskdienstBedarf ?? 0}
                className="w-20 rounded border px-2 py-1"
              />
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Turniere</legend>
            <label className="flex items-center justify-between gap-3 text-sm">
              Ordner
              <input
                type="number"
                name="turnierOrdnerBedarf"
                min="0"
                step="1"
                defaultValue={verein?.turnierOrdnerBedarf ?? 0}
                className="w-20 rounded border px-2 py-1"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              Kioskdienst
              <input
                type="number"
                name="turnierKioskdienstBedarf"
                min="0"
                step="1"
                defaultValue={verein?.turnierKioskdienstBedarf ?? 0}
                className="w-20 rounded border px-2 py-1"
              />
            </label>
          </fieldset>

          <button
            type="submit"
            className="rounded bg-black px-3 py-2 text-sm text-white"
          >
            Speichern
          </button>
        </form>
      </section>
    </div>
  );
}
