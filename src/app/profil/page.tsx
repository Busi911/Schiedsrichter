import { and, eq, gte, inArray } from "drizzle-orm";
import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
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
      .filter((r) => r.aktiv)
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

  const istSchiedsrichter = rollen.some(
    (r) => r.typ === "schiedsrichter" && r.aktiv
  );
  const eigeneTypen = rollen
    .filter((r) => r.aktiv)
    .map((r) => r.typ)
    .filter((t): t is (typeof SELBST_ANMELDBARE_TYPEN)[number] =>
      (SELBST_ANMELDBARE_TYPEN as readonly string[]).includes(t)
    );

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Mein Profil
            </p>
            <p className="font-heading text-lg font-semibold">
              {session.user.name ?? session.user.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/profil/kalender" />}
              nativeButton={false}
            >
              Kalender
            </Button>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Meine Rollen</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {rollen.length > 0 ? (
              rollen.map((r) => (
                <Badge key={r.id} variant={r.aktiv ? "secondary" : "outline"}>
                  {TYP_LABEL[r.typ] ?? r.typ}
                  {!r.aktiv && " (inaktiv)"}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Noch keine Rolle zugewiesen.
              </p>
            )}
          </CardContent>
        </Card>

        {istSchiedsrichter && (
          <Card>
            <CardHeader>
              <CardTitle>ICS-Feed (Spielansetzungen)</CardTitle>
              <CardDescription>
                Abo-Link deines Verbands hinterlegen, damit deine Einsätze
                automatisch synchronisiert werden.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <form action={updateIcsFeedUrl} className="flex flex-col gap-3">
                <Label htmlFor="icsFeedUrl">ICS-Feed-URL</Label>
                <Input
                  id="icsFeedUrl"
                  name="icsFeedUrl"
                  type="url"
                  defaultValue={profil?.icsFeedUrl ?? ""}
                  placeholder="https://.../schiedsrichter.ics"
                />
                <Button type="submit">Speichern</Button>
              </form>

              <form action={syncJetzt}>
                <Button type="submit" variant="outline" className="w-full">
                  Jetzt synchronisieren
                </Button>
              </form>

              {profil?.letzterSyncAm && (
                <p className="text-sm text-muted-foreground">
                  Letzter Sync: {formatDateTime(profil.letzterSyncAm)} (
                  {profil.letzterSyncStatus})
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {eigeneTypen.length > 0 && vereinEinstellungen && (
          <Card>
            <CardHeader>
              <CardTitle>Dienste (Ordner/Kioskdienst)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {verfuegbareTermine.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Keine anstehenden Termine.
                </p>
              )}
              {verfuegbareTermine.map((termin) => {
                const rollenMitBedarf = eigeneTypen.filter(
                  (typ) => bedarfFuer(vereinEinstellungen, termin.typ, typ) > 0
                );
                if (rollenMitBedarf.length === 0) return null;

                return (
                  <div key={termin.id} className="rounded-lg border p-3 text-sm">
                    <p>
                      {formatDateTime(termin.start)}
                      {termin.ort ? ` · ${termin.ort}` : ""}
                      {termin.beschreibung ? ` · ${termin.beschreibung}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                              <Button type="submit" variant="outline" size="sm">
                                {TYP_LABEL[typ]}: angemeldet (
                                {angemeldet.length}/{bedarf}) — abmelden
                              </Button>
                            </form>
                          );
                        }
                        if (voll) {
                          return (
                            <Badge key={typ} variant="outline">
                              {TYP_LABEL[typ]}: voll ({angemeldet.length}/
                              {bedarf})
                            </Badge>
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
                            <Button type="submit" size="sm">
                              Als {TYP_LABEL[typ]} anmelden ({angemeldet.length}
                              /{bedarf})
                            </Button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Meine Termine</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {eigeneTermine.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Keine Termine vorhanden.
              </p>
            )}
            {eigeneTermine.map((t) => (
              <div key={t.id} className="rounded-lg border p-3 text-sm">
                {formatDateTime(t.start)}
                {t.ort ? ` · ${t.ort}` : ""}
                {t.beschreibung ? ` · ${t.beschreibung}` : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
