import { requireAdmin } from "@/lib/session";
import { holeOffeneEinsaetze, holeZuschuesse } from "@/lib/zuschuss";
import { zuschussAnlegen } from "./actions";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(d);
}

export default async function ZuschuessePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [offeneEinsaetze, zuschuesseListe] = await Promise.all([
    holeOffeneEinsaetze(vereinId),
    holeZuschuesse(vereinId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Zuschüsse</h1>
      <p className="max-w-2xl text-sm text-gray-600">
        Einfache Zuschussberechnung pro geleitetem Einsatz (Satz × 1). Die
        eigentliche Abrechnung/Auszahlung läuft in einem externen System —
        hier nur Berechnung und Export.
      </p>

      <section>
        <h2 className="font-medium">Offene Einsätze (noch kein Zuschuss)</h2>
        <table className="mt-2 w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1 pr-4">Datum</th>
              <th className="py-1 pr-4">Beschreibung</th>
              <th className="py-1 pr-4">Person</th>
              <th className="py-1 pr-4">Rolle</th>
              <th className="py-1">Satz (€)</th>
            </tr>
          </thead>
          <tbody>
            {offeneEinsaetze.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-gray-500">
                  Keine offenen Einsätze.
                </td>
              </tr>
            )}
            {offeneEinsaetze.map((e) => (
              <tr
                key={`${e.terminId}-${e.userId}-${e.funktionstraegerTyp}`}
                className="border-b"
              >
                <td className="py-1 pr-4">{formatDate(e.terminStart)}</td>
                <td className="py-1 pr-4">{e.terminBeschreibung ?? "—"}</td>
                <td className="py-1 pr-4">{e.personName ?? e.personEmail}</td>
                <td className="py-1 pr-4">
                  {TYP_LABEL[e.funktionstraegerTyp] ?? e.funktionstraegerTyp}
                </td>
                <td className="py-1">
                  <form action={zuschussAnlegen} className="flex items-center gap-2">
                    <input type="hidden" name="terminId" value={e.terminId} />
                    <input type="hidden" name="userId" value={e.userId} />
                    <input
                      type="number"
                      name="satz"
                      min="0"
                      step="0.01"
                      required
                      className="w-20 rounded border px-2 py-1"
                    />
                    <button type="submit" className="rounded border px-2 py-1 text-xs">
                      Zuschuss anlegen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Zuschüsse</h2>
          <a
            href="/admin/zuschuesse/export"
            className="rounded bg-black px-3 py-1 text-sm text-white"
          >
            Offene als CSV exportieren
          </a>
        </div>
        <table className="mt-2 w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-1 pr-4">Datum</th>
              <th className="py-1 pr-4">Person</th>
              <th className="py-1 pr-4">Betrag</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {zuschuesseListe.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-gray-500">
                  Noch keine Zuschüsse angelegt.
                </td>
              </tr>
            )}
            {zuschuesseListe.map((z) => (
              <tr key={z.id} className="border-b">
                <td className="py-1 pr-4">{formatDate(z.terminStart)}</td>
                <td className="py-1 pr-4">{z.personName ?? z.personEmail}</td>
                <td className="py-1 pr-4">{z.berechneterBetrag} €</td>
                <td className="py-1">{z.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
