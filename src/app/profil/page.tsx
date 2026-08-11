import { and, eq, gte, inArray } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  schiedsrichterProfile,
  termine,
  terminZuordnungen,
  vereine,
} from "@/db/schema";
import { signOut } from "@/auth";
import { bedarfFuer } from "@/lib/dienste";
import {
  selbstAbmelden,
  selbstAnmelden,
  syncJetzt,
  updateIcsFeedUrl,
} from "./actions";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
};

const SELBST_ANMELDBARE_TYPEN = ["ordner", "kioskdienst"] as const;

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export default async function ProfilPage() {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;

  const {
    rollen,
    profil,
    eigeneTermine,
    verfuegbareTermine,
    zuordnungenFuerVerfuegbare,
    vereinEinstellungen,
  } = await withTenant(vereinId, async (tx) => {
    const rollen = await tx.query.funktionstraegerRollen.findMany({
      where: eq(funktionstraegerRollen.userId, userId),
    });
    const profil = await tx.query.schiedsrichterProfile.findFirst({
      where: eq(schiedsrichterProfile.userId, userId),
    });
    const eigeneTermine = await tx.query.termine.findMany({
      where: and(
        eq(termine.icsSchiedsrichterId, userId),
        eq(termine.vereinId, vereinId)
      ),
      orderBy: (t, { asc }) => [asc(t.start)],
    });

    const eigeneTypen = rollen
      .map((r) => r.typ)
      .filter((t): t is (typeof SELBST_ANMELDBARE_TYPEN)[number] =>
        (SELBST_ANMELDBARE_TYPEN as readonly string[]).includes(t)
      );

    // Dienste gelten bewusst nur für testspiel/turnier, nicht für spiel_ics
    // (persönliche Einsätze des Schiedsrichters, oft bei fremden Vereinen).
    const verfuegbareTermine = eigeneTypen.length
      ? await tx.query.termine.findMany({
          where: and(
            eq(termine.vereinId, vereinId),
            gte(termine.start, new Date()),
            inArray(termine.typ, ["testspiel", "turnier"])
          ),
          orderBy: (t, { asc }) => [asc(t.start)],
        })
      : [];

    const zuordnungenFuerVerfuegbare = verfuegbareTermine.length
      ? await tx.query.terminZuordnungen.findMany({
          where: inArray(
            terminZuordnungen.terminId,
            verfuegbareTermine.map((t) => t.id)
          ),
        })
      : [];

    const vereinEinstellungen = eigeneTypen.length
      ? await tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
      : undefined;

    return {
      rollen,
      profil,
      eigeneTermine,
      verfuegbareTermine,
      zuordnungenFuerVerfuegbare,
      vereinEinstellungen,
    };
  });

  const istSchiedsrichter = rollen.some((r) => r.typ === "schiedsrichter");
  const eigeneTypen = rollen
    .map((r) => r.typ)
    .filter((t): t is (typeof SELBST_ANMELDBARE_TYPEN)[number] =>
      (SELBST_ANMELDBARE_TYPEN as readonly string[]).includes(t)
    );

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <p className="text-xs uppercase text-gray-500">Mein Profil</p>
          <p className="font-medium">
            {session.user.name ?? session.user.email}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm underline">
            Logout
          </button>
        </form>
      </header>

      <main className="flex flex-col gap-8 p-6">
        <section>
          <h1 className="text-lg font-semibold">Meine Rollen</h1>
          <p className="text-sm text-gray-600">
            {rollen.length > 0
              ? rollen.map((r) => TYP_LABEL[r.typ] ?? r.typ).join(", ")
              : "Noch keine Rolle zugewiesen."}
          </p>
        </section>

        {istSchiedsrichter && (
          <section className="flex max-w-sm flex-col gap-3">
            <h2 className="font-medium">ICS-Feed (Spielansetzungen)</h2>
            <form action={updateIcsFeedUrl} className="flex flex-col gap-3">
              <label htmlFor="icsFeedUrl" className="text-sm">
                ICS-Feed-URL
              </label>
              <input
                id="icsFeedUrl"
                name="icsFeedUrl"
                type="url"
                defaultValue={profil?.icsFeedUrl ?? ""}
                placeholder="https://.../schiedsrichter.ics"
                className="rounded border px-3 py-2"
              />
              <button
                type="submit"
                className="rounded bg-black px-3 py-2 text-white"
              >
                Speichern
              </button>
            </form>

            <form action={syncJetzt}>
              <button type="submit" className="rounded border px-3 py-2">
                Jetzt synchronisieren
              </button>
            </form>

            {profil?.letzterSyncAm && (
              <p className="text-sm text-gray-600">
                Letzter Sync: {formatDateTime(profil.letzterSyncAm)} (
                {profil.letzterSyncStatus})
              </p>
            )}
          </section>
        )}

        {eigeneTypen.length > 0 && vereinEinstellungen && (
          <section>
            <h2 className="font-medium">Dienste (Ordner/Kioskdienst)</h2>
            <ul className="flex flex-col gap-2 pt-2">
              {verfuegbareTermine.length === 0 && (
                <li className="text-sm text-gray-500">
                  Keine anstehenden Termine.
                </li>
              )}
              {verfuegbareTermine.map((termin) => {
                const rollenMitBedarf = eigeneTypen.filter(
                  (typ) => bedarfFuer(vereinEinstellungen, termin.typ, typ) > 0
                );
                if (rollenMitBedarf.length === 0) return null;

                return (
                  <li
                    key={termin.id}
                    className="rounded border px-3 py-2 text-sm"
                  >
                    <p>
                      {formatDateTime(termin.start)}
                      {termin.ort ? ` · ${termin.ort}` : ""}
                      {termin.beschreibung ? ` · ${termin.beschreibung}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {rollenMitBedarf.map((typ) => {
                        const bedarf = bedarfFuer(
                          vereinEinstellungen,
                          termin.typ,
                          typ
                        );
                        const angemeldet = zuordnungenFuerVerfuegbare.filter(
                          (d) =>
                            d.terminId === termin.id &&
                            d.funktionstraegerTyp === typ
                        );
                        const bestehend = angemeldet.find(
                          (d) => d.userId === userId
                        );
                        const voll = angemeldet.length >= bedarf;

                        if (bestehend) {
                          return (
                            <form key={typ} action={selbstAbmelden}>
                              <input
                                type="hidden"
                                name="zuordnungId"
                                value={bestehend.id}
                              />
                              <button
                                type="submit"
                                className="rounded border px-2 py-1 text-xs"
                              >
                                {TYP_LABEL[typ]}: angemeldet (
                                {angemeldet.length}/{bedarf}) — abmelden
                              </button>
                            </form>
                          );
                        }
                        if (voll) {
                          return (
                            <span
                              key={typ}
                              className="rounded border px-2 py-1 text-xs text-gray-500"
                            >
                              {TYP_LABEL[typ]}: voll ({angemeldet.length}/
                              {bedarf})
                            </span>
                          );
                        }
                        return (
                          <form key={typ} action={selbstAnmelden}>
                            <input
                              type="hidden"
                              name="terminId"
                              value={termin.id}
                            />
                            <input type="hidden" name="typ" value={typ} />
                            <button
                              type="submit"
                              className="rounded bg-black px-2 py-1 text-xs text-white"
                            >
                              Als {TYP_LABEL[typ]} anmelden ({angemeldet.length}
                              /{bedarf})
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-medium">Meine Termine</h2>
          <ul className="flex flex-col gap-2 pt-2">
            {eigeneTermine.length === 0 && (
              <li className="text-sm text-gray-500">
                Keine Termine vorhanden.
              </li>
            )}
            {eigeneTermine.map((t) => (
              <li key={t.id} className="rounded border px-3 py-2 text-sm">
                {formatDateTime(t.start)}
                {t.ort ? ` · ${t.ort}` : ""}
                {t.beschreibung ? ` · ${t.beschreibung}` : ""}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
