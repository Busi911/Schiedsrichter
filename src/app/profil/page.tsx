import { and, eq, gte, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  mannschaften,
  schiedsrichterProfile,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { signOut } from "@/auth";
import { bedarfFuer, mannschaftBedarfDeaktiviertFuer } from "@/lib/dienste";
import { monatsBereich, parseMonatParam } from "@/lib/kalender";
import { holeEigeneKalenderEintraege } from "@/lib/eigener-kalender";
import {
  kalenderLinkDeaktivieren,
  kalenderLinkErneuern,
  selbstAbmelden,
  selbstAnmelden,
  syncJetzt,
  updateBenachrichtigungen,
  updateIcsFeedUrl,
  updateStammdaten,
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
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/logo";
import { MonatsKalender } from "@/components/monats-kalender";
import { SubmitButton } from "@/components/submit-button";
import { saisonLabel, saisonSortKey } from "@/lib/saison";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { appUrl } from "@/lib/app-url";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienstwart",
};

const SELBST_ANMELDBARE_TYPEN = ["ordner", "kioskdienst"] as const;

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string }>;
}) {
  const session = await requireSession();
  const vereinId = session.user.vereinId!;
  const userId = session.user.id;
  const { monat } = await searchParams;
  const { jahr, monatNull } = parseMonatParam(monat);
  const { von, bis } = monatsBereich(jahr, monatNull);

  const [
    {
      eigeneStammdaten,
      rollen,
      profil,
      eigeneTermine,
      verfuegbareTermine,
      zuordnungenFuerVerfuegbare,
      vereinEinstellungen,
      mannschaftenFuerVerfuegbare,
      verein,
      meineTurniere,
    },
    eintraegeProTag,
  ] = await Promise.all([
    withTenant(vereinId, async (tx) => {
      const verein = await tx.query.vereine.findFirst({
        where: eq(vereine.id, vereinId),
      });
      const eigeneStammdaten = await tx.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
          name: true,
          email: true,
          telefonnummer: true,
          wochenDigestAktiviert: true,
          terminErinnerungAktiviert: true,
          offeneSchiedsrichterErinnerungAktiviert: true,
          offeneZeitnehmerErinnerungAktiviert: true,
          kalenderToken: true,
        },
      });
      const rollen = await tx.query.funktionstraegerRollen.findMany({
        where: eq(funktionstraegerRollen.userId, userId),
      });
      const profil = await tx.query.schiedsrichterProfile.findFirst({
        where: eq(schiedsrichterProfile.userId, userId),
      });

      // "Meine Termine" gilt für alle Funktionsträger-Rollen, nicht nur
      // Schiedsrichter: eigene termin_zuordnung-Einträge (Zeitnehmer/
      // Sekretär/Ordner/Kioskdienst) sowie — für Trainer — alle Termine der
      // eigenen Mannschaft, zusätzlich zu den ICS-Feed-Einsätzen der
      // Schiedsrichter.
      const mannschaftIds = rollen
        .filter((r) => r.typ === "trainer" && r.mannschaftId)
        .map((r) => r.mannschaftId!);
      const eigeneZuordnungen = await tx.query.terminZuordnungen.findMany({
        where: eq(terminZuordnungen.userId, userId),
      });
      const zugeordneteTerminIds = eigeneZuordnungen.map((z) => z.terminId);

      const terminBedingungen = [eq(termine.icsSchiedsrichterId, userId)];
      if (zugeordneteTerminIds.length) {
        terminBedingungen.push(inArray(termine.id, zugeordneteTerminIds));
      }
      if (mannschaftIds.length) {
        terminBedingungen.push(inArray(termine.mannschaftId, mannschaftIds));
      }

      const eigeneTermineRoh = await tx.query.termine.findMany({
        where: and(eq(termine.vereinId, vereinId), or(...terminBedingungen)),
        orderBy: (t, { asc }) => [asc(t.start)],
      });
      const eigeneTermine = eigeneTermineRoh.map((t) => {
        const meineRollen = new Set<string>();
        if (t.icsSchiedsrichterId === userId) meineRollen.add("schiedsrichter");
        for (const z of eigeneZuordnungen) {
          if (z.terminId === t.id) meineRollen.add(z.funktionstraegerTyp);
        }
        if (t.mannschaftId && mannschaftIds.includes(t.mannschaftId)) {
          meineRollen.add("trainer");
        }
        return { ...t, meineRollen: [...meineRollen] };
      });

      const eigeneTypen = rollen
        .filter((r) => r.aktiv)
        .map((r) => r.typ)
        .filter((t): t is (typeof SELBST_ANMELDBARE_TYPEN)[number] =>
          (SELBST_ANMELDBARE_TYPEN as readonly string[]).includes(t)
        );

      // Dienste gelten bewusst nur für testspiel/turnier/rundenspiel, nicht
      // für spiel_ics (persönliche Einsätze des Schiedsrichters, oft bei
      // fremden Vereinen).
      const verfuegbareTermine = eigeneTypen.length
        ? await tx.query.termine.findMany({
            where: and(
              eq(termine.vereinId, vereinId),
              gte(termine.start, new Date()),
              inArray(termine.typ, ["testspiel", "turnier", "rundenspiel"])
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

      const mannschaftIdsFuerVerfuegbare = [
        ...new Set(
          verfuegbareTermine.map((t) => t.mannschaftId).filter((id): id is string => !!id)
        ),
      ];
      const mannschaftenFuerVerfuegbare = mannschaftIdsFuerVerfuegbare.length
        ? await tx.query.mannschaften.findMany({
            where: inArray(mannschaften.id, mannschaftIdsFuerVerfuegbare),
          })
        : [];

      // Turniere, für die dieser Nutzer als Turnierverantwortlicher benannt
      // wurde (siehe turnierVerantwortlicherId in db/schema.ts) — bewusst
      // unabhängig von den obigen Funktionsträger-Rollen, da das eine
      // pro-Turnier vom Admin vergebene Zusatzberechtigung ist, keine feste
      // Rolle.
      const meineTurniere = await tx.query.termine.findMany({
        where: and(
          eq(termine.vereinId, vereinId),
          eq(termine.typ, "turnier"),
          eq(termine.turnierVerantwortlicherId, userId)
        ),
        orderBy: (t, { asc }) => [asc(t.start)],
      });

      return {
        eigeneStammdaten,
        rollen,
        profil,
        eigeneTermine,
        verfuegbareTermine,
        zuordnungenFuerVerfuegbare,
        vereinEinstellungen,
        mannschaftenFuerVerfuegbare,
        verein,
        meineTurniere,
      };
    }),
    holeEigeneKalenderEintraege(vereinId, userId, von, bis),
  ]);

  const istSchiedsrichter = rollen.some(
    (r) => r.typ === "schiedsrichter" && r.aktiv
  );
  // Eigene Rolle, unabhängig von istSchiedsrichter/istAdmin — eine Person
  // kann gleichzeitig Schiedsrichter, Schiedsrichterwart und/oder
  // (System-)Admin sein (siehe src/lib/schiedsrichterwart.ts).
  const istSchiedsrichterwart = rollen.some(
    (r) => r.typ === "schiedsrichterwart" && r.aktiv
  );
  const istZeitnehmerwart = rollen.some(
    (r) => r.typ === "zeitnehmerwart" && r.aktiv
  );
  const istOrdnerwart = rollen.some(
    (r) => r.typ === "ordnerwart" && r.aktiv
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
          <div className="flex items-center gap-3">
            <Logo className="size-8 shrink-0 text-primary" />
            <div>
              <p className="font-heading text-lg font-semibold">
                {verein?.name ?? "Verein"}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.user.name ?? session.user.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(session.user.istAdmin || session.user.istAdminLesend) && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/admin" />}
                nativeButton={false}
              >
                Zum Admin-Bereich
              </Button>
            )}
            {istSchiedsrichterwart && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/profil/schiedsrichterwart" />}
                nativeButton={false}
              >
                Schiedsrichterwart
              </Button>
            )}
            {istZeitnehmerwart && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/profil/zeitnehmerwart" />}
                nativeButton={false}
              >
                Zeitnehmerwart
              </Button>
            )}
            {istOrdnerwart && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/profil/ordnerwart" />}
                nativeButton={false}
              >
                Ordnerwart
              </Button>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button
                type="submit"
                variant="outline"
                size="icon-sm"
                aria-label="Logout"
              >
                <LogOutIcon />
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Mein Kalender</CardTitle>
            <CardDescription>
              Alle Termine, bei denen du als Schiedsrichter, Zeitnehmer,
              Sekretär, Ordner, Kioskdienst oder Trainer beteiligt bist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonatsKalender
              jahr={jahr}
              monatNull={monatNull}
              eintraegeProTag={eintraegeProTag}
              basisPfad="/profil"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kalender abonnieren</CardTitle>
            <CardDescription>
              Abo-Link für Apple/Google/Outlook Kalender & Co. — dieselben
              Termine wie oben, automatisch aktuell gehalten, ohne dass du
              hier vorbeischauen musst.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {eigeneStammdaten?.kalenderToken ? (
              <>
                <p className="break-all rounded-lg border bg-muted/40 p-3 text-sm">
                  {appUrl()}/kalender/{eigeneStammdaten.kalenderToken}
                </p>
                {/* webcal:// statt https:// — auf iPhone/iPad/Mac öffnet das
                    antippen direkt den "Abonnement hinzufügen"-Dialog der
                    Kalender-App, ohne den Link manuell einfügen zu müssen.
                    Nebeneffekt: vermeidet auch iOS' "Unsichere Verbindung"-
                    Warnung, die beim manuellen Einfügen eines https-Links
                    dort erscheint (Apples generischer Hinweis für externe
                    Feeds, kein echtes Zertifikatsproblem) — "Fortfahren"
                    funktioniert zwar ebenso, aber webcal:// ist der direktere
                    Weg. */}
                <a
                  href={`webcal://${appUrl().replace(/^https?:\/\//, "")}/kalender/${eigeneStammdaten.kalenderToken}`}
                  className="text-sm text-primary underline"
                >
                  Direkt abonnieren (iPhone/iPad/Mac)
                </a>
                <p className="text-xs text-muted-foreground">
                  Für Google Kalender/Outlook den obigen Link dort manuell
                  als Abo einfügen.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Noch nicht aktiviert.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={kalenderLinkErneuern}>
                <Button type="submit" variant="outline" size="sm">
                  {eigeneStammdaten?.kalenderToken
                    ? "Link neu generieren (alter Link wird ungültig)"
                    : "Aktivieren"}
                </Button>
              </form>
              {eigeneStammdaten?.kalenderToken && (
                <form action={kalenderLinkDeaktivieren}>
                  <ConfirmSubmitButton
                    confirmText="Kalender-Abo deaktivieren? Der bisherige Link funktioniert danach nicht mehr."
                    variant="ghost"
                    size="sm"
                  >
                    Deaktivieren
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle>Meine Stammdaten</CardTitle>
            <CardDescription>
              Name und Telefonnummer selbst pflegen. Die E-Mail-Adresse (dein
              Login) kann nur der Vereinsadmin ändern.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateStammdaten} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={eigeneStammdaten?.name ?? ""}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="telefonnummer">Telefonnummer</Label>
                <Input
                  id="telefonnummer"
                  name="telefonnummer"
                  type="tel"
                  defaultValue={eigeneStammdaten?.telefonnummer ?? ""}
                  placeholder="optional"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                E-Mail: {eigeneStammdaten?.email ?? session.user.email}
              </p>
              <Button type="submit">Speichern</Button>
            </form>
            <Link
              href="/profil/passwort-aendern"
              className="mt-3 inline-block text-sm text-muted-foreground underline"
            >
              Passwort ändern
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>E-Mail-Benachrichtigungen</CardTitle>
            <CardDescription>
              Welche automatischen Erinnerungs-Mails du bekommen möchtest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={updateBenachrichtigungen}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="wochenDigestAktiviert" className="font-normal">
                  Wöchentliches Update über anstehende Termine
                </Label>
                <Switch
                  key={String(eigeneStammdaten?.wochenDigestAktiviert ?? true)}
                  id="wochenDigestAktiviert"
                  name="wochenDigestAktiviert"
                  defaultChecked={eigeneStammdaten?.wochenDigestAktiviert ?? true}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="terminErinnerungAktiviert"
                  className="font-normal"
                >
                  Erinnerung 24 Stunden vor einem Termin
                </Label>
                <Switch
                  key={String(eigeneStammdaten?.terminErinnerungAktiviert ?? true)}
                  id="terminErinnerungAktiviert"
                  name="terminErinnerungAktiviert"
                  defaultChecked={eigeneStammdaten?.terminErinnerungAktiviert ?? true}
                />
              </div>
              {istSchiedsrichterwart && (
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="offeneSchiedsrichterErinnerungAktiviert"
                    className="font-normal"
                  >
                    Als Schiedsrichterwart: Erinnerung an unbesetzte Spiele
                  </Label>
                  <Switch
                    key={String(
                      eigeneStammdaten?.offeneSchiedsrichterErinnerungAktiviert ?? true
                    )}
                    id="offeneSchiedsrichterErinnerungAktiviert"
                    name="offeneSchiedsrichterErinnerungAktiviert"
                    defaultChecked={
                      eigeneStammdaten?.offeneSchiedsrichterErinnerungAktiviert ?? true
                    }
                  />
                </div>
              )}
              {istZeitnehmerwart && (
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="offeneZeitnehmerErinnerungAktiviert"
                    className="font-normal"
                  >
                    Als Zeitnehmerwart: Erinnerung an unbesetzte Zeitnehmer-/
                    Sekretär-Posten
                  </Label>
                  <Switch
                    key={String(
                      eigeneStammdaten?.offeneZeitnehmerErinnerungAktiviert ?? true
                    )}
                    id="offeneZeitnehmerErinnerungAktiviert"
                    name="offeneZeitnehmerErinnerungAktiviert"
                    defaultChecked={
                      eigeneStammdaten?.offeneZeitnehmerErinnerungAktiviert ?? true
                    }
                  />
                </div>
              )}
              <SubmitButton className="w-full">Speichern</SubmitButton>
            </form>
          </CardContent>
        </Card>

        {meineTurniere.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Meine Turniere</CardTitle>
              <CardDescription>
                Du wurdest als Turnierverantwortlicher benannt und kannst
                Spielplan und Ergebnisse pflegen.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {meineTurniere.map((t) => (
                <Link
                  key={t.id}
                  href={`/profil/turnier/${t.id}`}
                  className="rounded-lg border p-3 text-sm underline"
                >
                  {t.beschreibung ?? "Turnier"} · {formatDateTime(t.start)}
                  {t.ort ? ` · ${t.ort}` : ""}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {istSchiedsrichter && (
          <Card>
            <CardHeader>
              <CardTitle>ICS-Feed (Spielansetzungen)</CardTitle>
              <CardDescription>
                Abo-Link deines Verbands hinterlegen, damit deine Einsätze
                automatisch synchronisiert werden. Aktuelle Spielzeit:{" "}
                <strong>Saison {saisonLabel(new Date())}</strong>.
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
                const mannschaft = termin.mannschaftId
                  ? mannschaftenFuerVerfuegbare.find((m) => m.id === termin.mannschaftId)
                  : null;
                const rollenMitBedarf = eigeneTypen.filter(
                  (typ) =>
                    bedarfFuer(
                      vereinEinstellungen,
                      termin.typ,
                      typ,
                      termin.pflichtspiel,
                      termin.freundschaftsTyp,
                      undefined,
                      mannschaftBedarfDeaktiviertFuer(mannschaft, typ)
                    ) > 0
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
                          typ,
                          termin.pflichtspiel,
                          termin.freundschaftsTyp,
                          undefined,
                          mannschaftBedarfDeaktiviertFuer(mannschaft, typ)
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
            <CardDescription>
              Nach Saison gruppiert (Juli–Juni) — ein fortlaufender Verlauf
              über mehrere Spielzeiten.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {eigeneTermine.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Keine Termine vorhanden.
              </p>
            )}
            {Object.entries(
              eigeneTermine.reduce<Record<string, typeof eigeneTermine>>(
                (gruppen, t) => {
                  const saison = saisonLabel(t.start);
                  (gruppen[saison] ??= []).push(t);
                  return gruppen;
                },
                {}
              )
            )
              .sort(([a], [b]) => saisonSortKey(b) - saisonSortKey(a))
              .map(([saison, termineDerSaison]) => (
                <div key={saison} className="flex flex-col gap-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Saison {saison}
                  </p>
                  {termineDerSaison.map((t) => (
                    <div key={t.id} className="rounded-lg border p-3 text-sm">
                      {formatDateTime(t.start)}
                      {t.ort ? ` · ${t.ort}` : ""}
                      {t.beschreibung ? ` · ${t.beschreibung}` : ""}
                      {t.meineRollen.length > 0 && (
                        <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                          {t.meineRollen.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">
                              {TYP_LABEL[r] ?? r}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
