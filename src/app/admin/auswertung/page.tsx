import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, users } from "@/db/schema";
import { holeTermineFuerAuswertung } from "@/lib/termin-auswertung";

const TYP_LABEL: Record<string, string> = {
  spiel_ics: "Spiel (ICS)",
  testspiel: "Testspiel",
  turnier: "Turnier",
};

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function AuswertungPage({
  searchParams,
}: {
  searchParams: Promise<{
    von?: string;
    bis?: string;
    typ?: string;
    schiedsrichterId?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const filter = await searchParams;

  const [termineListe, schiedsrichterListe] = await Promise.all([
    holeTermineFuerAuswertung(vereinId, filter),
    withTenant(vereinId, (tx) =>
      tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(funktionstraegerRollen)
        .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
        .where(eq(funktionstraegerRollen.typ, "schiedsrichter"))
    ),
  ]);

  const exportParams = new URLSearchParams();
  if (filter.von) exportParams.set("von", filter.von);
  if (filter.bis) exportParams.set("bis", filter.bis);
  if (filter.typ) exportParams.set("typ", filter.typ);
  if (filter.schiedsrichterId)
    exportParams.set("schiedsrichterId", filter.schiedsrichterId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Terminauswertung</h1>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="von" className="text-sm">
            Von
          </label>
          <input
            id="von"
            name="von"
            type="date"
            defaultValue={filter.von}
            className="rounded border px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bis" className="text-sm">
            Bis
          </label>
          <input
            id="bis"
            name="bis"
            type="date"
            defaultValue={filter.bis}
            className="rounded border px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="typ" className="text-sm">
            Typ
          </label>
          <select
            id="typ"
            name="typ"
            defaultValue={filter.typ ?? ""}
            className="rounded border px-3 py-2"
          >
            <option value="">Alle</option>
            {Object.entries(TYP_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="schiedsrichterId" className="text-sm">
            Schiedsrichter
          </label>
          <select
            id="schiedsrichterId"
            name="schiedsrichterId"
            defaultValue={filter.schiedsrichterId ?? ""}
            className="rounded border px-3 py-2"
          >
            <option value="">Alle</option>
            {schiedsrichterListe.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.email}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded border px-3 py-2">
          Filtern
        </button>
        <a
          href={`/admin/auswertung/export?${exportParams.toString()}`}
          className="rounded bg-black px-3 py-2 text-white"
        >
          Als CSV exportieren
        </a>
        <a
          href={`/admin/auswertung/export/pdf?${exportParams.toString()}`}
          className="rounded border px-3 py-2"
        >
          Als PDF exportieren
        </a>
      </form>

      <table className="w-full max-w-4xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-1 pr-4">Datum</th>
            <th className="py-1 pr-4">Typ</th>
            <th className="py-1 pr-4">Ort</th>
            <th className="py-1 pr-4">Beschreibung</th>
            <th className="py-1 pr-4">Mannschaft</th>
            <th className="py-1">Schiedsrichter</th>
          </tr>
        </thead>
        <tbody>
          {termineListe.length === 0 && (
            <tr>
              <td colSpan={6} className="py-2 text-gray-500">
                Keine Termine für die gewählten Filter.
              </td>
            </tr>
          )}
          {termineListe.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-1 pr-4">{formatDateTime(t.start)}</td>
              <td className="py-1 pr-4">{TYP_LABEL[t.typ] ?? t.typ}</td>
              <td className="py-1 pr-4">{t.ort ?? "—"}</td>
              <td className="py-1 pr-4">{t.beschreibung ?? "—"}</td>
              <td className="py-1 pr-4">{t.mannschaftName ?? "—"}</td>
              <td className="py-1">{t.schiedsrichterName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
