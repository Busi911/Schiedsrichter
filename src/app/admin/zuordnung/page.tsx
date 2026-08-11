import { requireAdmin } from "@/lib/session";
import {
  holeTermineMitZuordnungen,
  holeZuordenbareFunktionstraeger,
} from "@/lib/zuordnung";
import { zuordnen, zuordnungEntfernen } from "./actions";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
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
      <h1 className="text-lg font-semibold">Spielzuordnung</h1>
      <p className="max-w-2xl text-sm text-gray-600">
        Schiedsrichter aus dem ICS-Feed sind bereits automatisch zugeordnet.
        Hier zusätzlich Zeitnehmer, Sekretäre (oder weitere Schiedsrichter,
        z.B. für Testspiele/Turniere) zu anstehenden Terminen zuordnen.
      </p>

      <div className="flex flex-col gap-4">
        {termine.length === 0 && (
          <p className="text-sm text-gray-500">Keine anstehenden Termine.</p>
        )}
        {termine.map((termin) => (
          <div key={termin.id} className="max-w-2xl rounded border p-4">
            <p className="font-medium">
              {formatDateTime(termin.start)} · {TYP_LABEL[termin.typ] ?? termin.typ}
              {termin.ort ? ` · ${termin.ort}` : ""}
            </p>
            {termin.beschreibung && (
              <p className="text-sm text-gray-600">{termin.beschreibung}</p>
            )}

            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {termin.icsSchiedsrichter && (
                <li>
                  Schiedsrichter (ICS): {termin.icsSchiedsrichter.name ?? termin.icsSchiedsrichter.email}
                </li>
              )}
              {termin.zuordnungen.length === 0 && !termin.icsSchiedsrichter && (
                <li className="text-gray-500">Noch niemand zugeordnet.</li>
              )}
              {termin.zuordnungen.map((z) => (
                <li key={z.id} className="flex items-center gap-2">
                  {TYP_LABEL[z.funktionstraegerTyp] ?? z.funktionstraegerTyp}:{" "}
                  {z.name ?? z.email}
                  {z.quelle === "selbst_angemeldet" && " (selbst angemeldet)"}
                  <form action={zuordnungEntfernen}>
                    <input type="hidden" name="zuordnungId" value={z.id} />
                    <button type="submit" className="text-xs underline">
                      Entfernen
                    </button>
                  </form>
                </li>
              ))}
            </ul>

            <form action={zuordnen} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="terminId" value={termin.id} />
              <select name="personTyp" required className="rounded border px-2 py-1 text-sm">
                <option value="">Person wählen…</option>
                {personen.map((p) => (
                  <option key={`${p.userId}-${p.typ}`} value={`${p.userId}|${p.typ}`}>
                    {(p.name ?? p.email) + ` (${TYP_LABEL[p.typ] ?? p.typ})`}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded border px-3 py-1 text-sm">
                Zuordnen
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
