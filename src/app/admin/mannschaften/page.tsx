import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { mannschaften } from "@/db/schema";
import { createMannschaft } from "../actions";

export default async function MannschaftenPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const liste = await withTenant(vereinId, (tx) =>
    tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    })
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Mannschaften</h1>

      <ul className="flex flex-col gap-2">
        {liste.length === 0 && (
          <li className="text-sm text-gray-500">Noch keine Mannschaften angelegt.</li>
        )}
        {liste.map((m) => (
          <li key={m.id} className="rounded border px-3 py-2 text-sm">
            {m.name}
            {m.altersklasse ? ` (${m.altersklasse})` : ""}
          </li>
        ))}
      </ul>

      <form action={createMannschaft} className="flex max-w-sm flex-col gap-3">
        <h2 className="font-medium">Neue Mannschaft</h2>
        <label htmlFor="name" className="text-sm">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="rounded border px-3 py-2"
        />
        <label htmlFor="altersklasse" className="text-sm">
          Altersklasse (optional)
        </label>
        <input
          id="altersklasse"
          name="altersklasse"
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Anlegen
        </button>
      </form>
    </div>
  );
}
