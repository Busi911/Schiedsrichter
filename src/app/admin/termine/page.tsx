import { and, eq, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften, termine } from "@/db/schema";
import { createTermin } from "../actions";

const TYP_LABEL: Record<string, string> = {
  testspiel: "Testspiel",
  turnier: "Turnier",
};

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function TerminePage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [liste, mannschaftsListe] = await withTenant(vereinId, async (tx) => {
    const liste = await tx.query.termine.findMany({
      where: and(
        eq(termine.vereinId, vereinId),
        inArray(termine.typ, ["testspiel", "turnier"])
      ),
      orderBy: (t, { asc }) => [asc(t.start)],
    });
    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    });
    return [liste, mannschaftsListe];
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Testspiele &amp; Turniere</h1>

      <ul className="flex flex-col gap-2">
        {liste.length === 0 && (
          <li className="text-sm text-gray-500">Noch keine Termine angelegt.</li>
        )}
        {liste.map((t) => (
          <li key={t.id} className="rounded border px-3 py-2 text-sm">
            <span className="font-medium">{TYP_LABEL[t.typ] ?? t.typ}</span>{" "}
            — {formatDateTime(t.start)}
            {t.ort ? ` · ${t.ort}` : ""}
            {t.beschreibung ? ` · ${t.beschreibung}` : ""}
          </li>
        ))}
      </ul>

      <form action={createTermin} className="flex max-w-sm flex-col gap-3">
        <h2 className="font-medium">Neuer Termin</h2>

        <label htmlFor="typ" className="text-sm">
          Typ
        </label>
        <select id="typ" name="typ" required className="rounded border px-3 py-2">
          <option value="testspiel">Testspiel</option>
          <option value="turnier">Turnier</option>
        </select>

        <label htmlFor="start" className="text-sm">
          Start
        </label>
        <input
          id="start"
          name="start"
          type="datetime-local"
          required
          className="rounded border px-3 py-2"
        />

        <label htmlFor="ende" className="text-sm">
          Ende (optional)
        </label>
        <input
          id="ende"
          name="ende"
          type="datetime-local"
          className="rounded border px-3 py-2"
        />

        <label htmlFor="ort" className="text-sm">
          Ort
        </label>
        <input id="ort" name="ort" className="rounded border px-3 py-2" />

        <label htmlFor="beschreibung" className="text-sm">
          Beschreibung / Gegner
        </label>
        <input
          id="beschreibung"
          name="beschreibung"
          className="rounded border px-3 py-2"
        />

        <label htmlFor="mannschaftId" className="text-sm">
          Mannschaft (optional)
        </label>
        <select
          id="mannschaftId"
          name="mannschaftId"
          className="rounded border px-3 py-2"
        >
          <option value="">—</option>
          {mannschaftsListe.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Anlegen
        </button>
      </form>
    </div>
  );
}
