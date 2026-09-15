import { and, eq, inArray, or } from "drizzle-orm";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/db";
import {
  funktionstraegerRollen,
  schiedsrichterProfile,
  termine,
  terminZuordnungen,
  users,
  vereine,
} from "@/db/schema";
import { signOut } from "@/auth";
import {
  holeEigeneOffenenDienste,
  SELBST_ANMELDBARE_TYPEN,
} from "@/lib/eigene-offene-dienste";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/logo";
import { MonatsKalender } from "@/components/monats-kalender";
import { SubmitButton } from "@/components/submit-button";
import { saisonLabel, saisonSortKey } from "@/lib/saison";
import { cn } from "@/lib/utils";
import { formatDatumZeit as formatDateTime } from "@/lib/format";
import { appUrl } from "@/lib/app-url";

const TYP_LABEL: Record<string, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
  trainer: "Trainer",
  ordner: "Ordner",
  kioskdienst: "Kioskdienst",
  kassierer: "Kassierer",
  schiedsrichterwart: "Schiedsrichterwart",
  zeitnehmerwart: "Zeitnehmer-/Sekretärwart",
  ordnerwart: "Ordner-/Kioskdienst-/Kassiererwart",
};

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
    { eigeneStammdaten, rollen, profil, eigeneTermine, verein, meineTurniere },
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
      // Sekretär/Ordner/Kioskdienst/Kassierer) sowie — für Trainer — alle
      // Termine der eigenen Mannschaft, zusätzlich zu den ICS-Feed-Einsätzen
      // der Schiedsrichter.
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
  const eigeneOffeneDienste = eigeneTypen.length
    ? await holeEigeneOffenenDienste(vereinId, userId, eigeneTypen)
    : [];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-6 py-4">
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
            {(istSchiedsrichterwart || session.user.istAdmin) && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/profil/schiedsrichterwart" />}
                nativeButton={false}
              >
                Schiedsrichterwart
              </Button>
            )}
            {(istZeitnehmerwart || session.user.istAdmin) && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/profil/zeitnehmerwart" />}
                nativeButton={false}
              >
                Zeitnehmerwart
              </Button>
            )}
            {(istOrdnerwart || session.user.istAdmin) && (
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

      <main className="mx-auto flex max-w-screen-2xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Mein Kalender</CardTitle>
            <CardDescription>
              Alle Termine, bei denen du als Schiedsrichter, Zeitnehmer,
              Sekretär, Ordner, Kioskdienst, Kassierer oder Trainer beteiligt
              bist.
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

        {/* Einstellungen als Reiter statt eigener Cards — jede öffnet ihren
            bisherigen Karteninhalt unverändert in einem Modal (siehe Dialog-
            Muster in monats-kalender.tsx), damit die Seite nicht durch eine
            lange Kette selten genutzter Konfigurationsformulare scrollt. */}
        <Card>
          <CardHeader>
            <CardTitle>Einstellungen</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                Kalender abonnieren
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Kalender abonnieren</DialogTitle>
                  <DialogDescription>
                    Abo-Link für Apple/Google/Outlook Kalender & Co. —
                    dieselben Termine wie oben, automatisch aktuell gehalten,
                    ohne dass du hier vorbeischauen musst.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                  {eigeneStammdaten?.kalenderToken ? (
                    <>
                      <p className="break-all rounded-lg border bg-muted/40 p-3 text-sm">
                        {appUrl()}/kalender/{eigeneStammdaten.kalenderToken}
                      </p>
                      {/* webcal:// statt https:// — auf iPhone/iPad/Mac
                          öffnet das antippen direkt den "Abonnement
                          hinzufügen"-Dialog der Kalender-App, ohne den Link
                          manuell einfügen zu müssen. Nebeneffekt: vermeidet
                          auch iOS' "Unsichere Verbindung"-Warnung, die beim
                          manuellen Einfügen eines https-Links dort
                          erscheint (Apples generischer Hinweis für externe
                          Feeds, kein echtes Zertifikatsproblem) —
                          "Fortfahren" funktioniert zwar ebenso, aber
                          webcal:// ist der direktere Weg. */}
                      <a
                        href={`webcal://${appUrl().replace(/^https?:\/\//, "")}/kalender/${eigeneStammdaten.kalenderToken}`}
                        className="text-sm text-primary underline"
                      >
                        Direkt abonnieren (iPhone/iPad/Mac)
                      </a>
                      <p className="text-xs text-muted-foreground">
                        Für Google Kalender/Outlook den obigen Link dort
                        manuell als Abo einfügen.
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
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                Stammdaten
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Meine Stammdaten</DialogTitle>
                  <DialogDescription>
                    Name und Telefonnummer selbst pflegen. Die E-Mail-Adresse
                    (dein Login) kann nur der Vereinsadmin ändern.
                  </DialogDescription>
                </DialogHeader>
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
                  className="inline-block text-sm text-muted-foreground underline"
                >
                  Passwort ändern
                </Link>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger render={<Button variant="outline" size="sm" />}>
                Benachrichtigungen
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>E-Mail-Benachrichtigungen</DialogTitle>
                  <DialogDescription>
                    Welche automatischen Erinnerungs-Mails du bekommen
                    möchtest.
                  </DialogDescription>
                </DialogHeader>
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
                        Als Zeitnehmerwart: Erinnerung an unbesetzte
                        Zeitnehmer-/Sekretär-Posten
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
              </DialogContent>
            </Dialog>

            {istSchiedsrichter && (
              <Dialog>
                <DialogTrigger render={<Button variant="outline" size="sm" />}>
                  ICS-Feed
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>ICS-Feed (Spielansetzungen)</DialogTitle>
                    <DialogDescription>
                      Abo-Link deines Verbands hinterlegen, damit deine
                      Einsätze automatisch synchronisiert werden. Aktuelle
                      Spielzeit: <strong>Saison {saisonLabel(new Date())}</strong>.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
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
                  </div>
                </DialogContent>
              </Dialog>
            )}
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

        {eigeneTypen.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Offene Dienste</CardTitle>
              <CardDescription>
                Anstehende Termine mit noch freiem Platz für eine deiner
                Rollen — bereits vollständig besetzte Dienste werden hier
                nicht angezeigt.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {eigeneOffeneDienste.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aktuell keine offenen Dienste für deine Rollen.
                </p>
              )}
              {eigeneOffeneDienste.map((termin) => (
                <div key={termin.terminId} className="rounded-lg border p-3 text-sm">
                  <p>
                    {formatDateTime(termin.start)}
                    {termin.ort ? ` · ${termin.ort}` : ""}
                    {termin.beschreibung ? ` · ${termin.beschreibung}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {termin.rollen.map((rolle) =>
                      rolle.zuordnungId ? (
                        <form key={rolle.typ} action={selbstAbmelden}>
                          <input
                            type="hidden"
                            name="zuordnungId"
                            value={rolle.zuordnungId}
                          />
                          <Button type="submit" variant="outline" size="sm">
                            {TYP_LABEL[rolle.typ]}: angemeldet — abmelden
                          </Button>
                        </form>
                      ) : (
                        <form key={rolle.typ} action={selbstAnmelden}>
                          <input
                            type="hidden"
                            name="terminId"
                            value={termin.terminId}
                          />
                          <input type="hidden" name="typ" value={rolle.typ} />
                          <Button type="submit" size="sm">
                            Als {TYP_LABEL[rolle.typ]} anmelden
                            {rolle.anzahlHinweis ? ` (${rolle.anzahlHinweis})` : ""}
                          </Button>
                        </form>
                      )
                    )}
                  </div>
                </div>
              ))}
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
            {(() => {
              const jetzt = new Date();
              const aktuelleSaison = saisonSortKey(saisonLabel(jetzt));
              return Object.entries(
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
                  // Abgeschlossene (vergangene) Saisons eingeklappt, damit
                  // die Liste über die Jahre nicht immer weiter aufläuft —
                  // die laufende (und eine theoretisch schon begonnene
                  // zukünftige) Saison bleibt offen.
                  <details
                    key={saison}
                    open={saisonSortKey(saison) >= aktuelleSaison}
                  >
                    <summary className="cursor-pointer list-none text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Saison {saison}
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      {termineDerSaison.map((t) => (
                        <div
                          key={t.id}
                          className={cn(
                            "rounded-lg border p-3 text-sm",
                            // Bereits abgelaufene Termine ausgegraut, statt
                            // sie optisch gleichwertig zu den anstehenden
                            // darzustellen — auch innerhalb der laufenden
                            // Saison liegen ja meist schon einige zurück.
                            t.start < jetzt && "text-muted-foreground opacity-60"
                          )}
                        >
                          {formatDateTime(t.start)}
                          {t.ort ? ` · ${t.ort}` : ""}
                          {t.beschreibung ? ` · ${t.beschreibung}` : ""}
                          {t.meineRollen.length > 0 && (
                            <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                              {t.meineRollen.map((r) => (
                                <Badge
                                  key={r}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {TYP_LABEL[r] ?? r}
                                </Badge>
                              ))}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ));
            })()}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
