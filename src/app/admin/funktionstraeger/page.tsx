import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, mannschaften, users } from "@/db/schema";
import { createFunktionstraeger } from "../actions";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

export default async function FunktionstraegerPage() {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;

  const [rollen, mannschaftsListe] = await withTenant(vereinId, async (tx) => {
    const rollen = await tx
      .select({
        rolleId: funktionstraegerRollen.id,
        typ: funktionstraegerRollen.typ,
        name: users.name,
        email: users.email,
        mannschaftName: mannschaften.name,
      })
      .from(funktionstraegerRollen)
      .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
      .leftJoin(
        mannschaften,
        eq(funktionstraegerRollen.mannschaftId, mannschaften.id)
      )
      .where(eq(users.vereinId, vereinId));

    const mannschaftsListe = await tx.query.mannschaften.findMany({
      where: eq(mannschaften.vereinId, vereinId),
      orderBy: (m, { asc }) => [asc(m.name)],
    });

    return [rollen, mannschaftsListe];
  });

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold">Funktionsträger</h1>

      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-1 pr-4">Name</th>
            <th className="py-1 pr-4">E-Mail</th>
            <th className="py-1 pr-4">Rolle</th>
            <th className="py-1">Mannschaft</th>
          </tr>
        </thead>
        <tbody>
          {rollen.length === 0 && (
            <tr>
              <td colSpan={4} className="py-2 text-gray-500">
                Noch keine Funktionsträger angelegt.
              </td>
            </tr>
          )}
          {rollen.map((r) => (
            <tr key={r.rolleId} className="border-b">
              <td className="py-1 pr-4">{r.name}</td>
              <td className="py-1 pr-4">{r.email}</td>
              <td className="py-1 pr-4">{TYP_LABEL[r.typ] ?? r.typ}</td>
              <td className="py-1">{r.mannschaftName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        action={createFunktionstraeger}
        className="flex max-w-sm flex-col gap-3"
      >
        <h2 className="font-medium">Neuer Funktionsträger</h2>

        <label htmlFor="name" className="text-sm">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="rounded border px-3 py-2"
        />

        <label htmlFor="email" className="text-sm">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded border px-3 py-2"
        />

        <label htmlFor="typ" className="text-sm">
          Rolle
        </label>
        <select id="typ" name="typ" required className="rounded border px-3 py-2">
          {Object.entries(TYP_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label htmlFor="mannschaftId" className="text-sm">
          Mannschaft (nur bei Trainer)
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
