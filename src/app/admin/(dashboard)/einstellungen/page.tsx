import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, ligaVereinLogos, vereine } from "@/db/schema";
import {
  dienstBedarfSpeichern,
  logoEntfernen,
  mannschaftsnamenSpeichern,
  logoHochladen,
  oeffentlicheSeiteEntfernen,
  oeffentlicheSeiteSpeichern,
  nuligaEinstellungenSpeichern,
  vereinsdatenSpeichern,
} from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { VereinLoeschenDialog } from "@/components/verein-loeschen-dialog";
import { LigaAutoWeiter } from "@/components/liga-auto-weiter";

// Der erste Sync der öffentlichen Vereinsseite fragt nuLiga bewusst langsam
// ab (siehe lib/nuliga/client.ts) und braucht dafür mehr als das Standard-
// Zeitlimit einer Server Action.
export const maxDuration = 60;

export default async function EinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{
    nuligaNeu?: string;
    nuligaAktualisiert?: string;
    nuligaEntfernt?: string;
    nuligaFehler?: string;
    nuligaDiagnose?: string;
    ligaStatus?: string;
    ligaNeu?: string;
    ligaAnfragen?: string;
    ligaMeldungen?: string;
    ligaWeiter?: string;
    ligaRunde?: string;
  }>;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const nuligaErgebnis = await searchParams;

  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
  );

  const ligaVerein = await adminDb.query.ligaVereine.findFirst({
    where: eq(ligaVereine.vereinId, vereinId),
  });

  const logo = ligaVerein
    ? await adminDb.query.ligaVereinLogos.findFirst({
        where: eq(ligaVereinLogos.ligaVereinId, ligaVerein.id),
        columns: { aktualisiertAm: true },
      })
    : null;

  const ligaMannschaftsListe = ligaVerein
    ? await adminDb.query.ligaMannschaften.findMany({
        where: and(eq(ligaMannschaften.ligaVereinId, ligaVerein.id), eq(ligaMannschaften.aktiv, true)),
        orderBy: [asc(ligaMannschaften.kategorie), asc(ligaMannschaften.altersklasse), asc(ligaMannschaften.nummer)],
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Einstellungen</h1>
      </div>

      {nuligaErgebnis.nuligaNeu !== undefined && (
        <Alert
          variant={nuligaErgebnis.nuligaFehler ? "destructive" : "default"}
          className="max-w-md"
        >
          <AlertTitle>
            nuLiga-Sync: {nuligaErgebnis.nuligaNeu} neu,{" "}
            {nuligaErgebnis.nuligaAktualisiert ?? 0} aktualisiert,{" "}
            {nuligaErgebnis.nuligaEntfernt ?? 0} entfernt
          </AlertTitle>
          {(nuligaErgebnis.nuligaFehler || nuligaErgebnis.nuligaDiagnose) && (
            <AlertDescription>
              {nuligaErgebnis.nuligaFehler?.split(" | ").map((f) => (
                <p key={f}>{f}</p>
              ))}
              {nuligaErgebnis.nuligaDiagnose && (
                <p className="text-xs text-muted-foreground">
                  {nuligaErgebnis.nuligaDiagnose}
                </p>
              )}
            </AlertDescription>
          )}
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Vereinsdaten</CardTitle>
          <CardDescription>
            Wird aktuell nur informativ hinterlegt (z.B. für spätere
            Rechnungen) — bislang nirgends in der App sichtbar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={vereinsdatenSpeichern} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="strasse">Straße und Hausnummer</Label>
              <Input
                id="strasse"
                name="strasse"
                defaultValue={verein?.strasse ?? ""}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex w-28 flex-col gap-2">
                <Label htmlFor="plz">PLZ</Label>
                <Input
                  id="plz"
                  name="plz"
                  inputMode="numeric"
                  defaultValue={verein?.plz ?? ""}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="ort">Ort</Label>
                <Input id="ort" name="ort" defaultValue={verein?.ort ?? ""} />
              </div>
            </div>
            <SubmitButton size="sm" className="self-start" pendingText="Wird gespeichert…">
              Speichern
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      {nuligaErgebnis.ligaStatus !== undefined && (
        <Alert
          variant={nuligaErgebnis.ligaStatus === "fehler" ? "destructive" : "default"}
          className="max-w-2xl"
        >
          <AlertTitle>
            Öffentliche Vereinsseite: Synchronisation {nuligaErgebnis.ligaStatus} (
            {nuligaErgebnis.ligaNeu ?? 0} neu, {nuligaErgebnis.ligaAnfragen ?? 0} nuLiga-Abrufe)
          </AlertTitle>
          {nuligaErgebnis.ligaMeldungen && (
            <AlertDescription>
              {nuligaErgebnis.ligaMeldungen.split(" | ").map((m) => (
                <p key={m}>{m}</p>
              ))}
            </AlertDescription>
          )}
          {nuligaErgebnis.ligaWeiter === "1" && ligaVerein && session.user.istAdmin && (
            <LigaAutoWeiter
              aktion={oeffentlicheSeiteSpeichern}
              clubId={ligaVerein.nuligaClubId ?? ""}
              handballNetClubId={ligaVerein.handballNetClubId ?? ""}
              handballNetTeamIds={ligaVerein.handballNetTeamIds ?? ""}
              runde={Number(nuligaErgebnis.ligaRunde) || 1}
            />
          )}
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Öffentliche Vereinsseite</CardTitle>
          <CardDescription>
            Zeigt Mannschaften, Spielpläne, Ergebnisse und Tabellen eures Vereins
            aus nuLiga und handball.net auf einer öffentlichen Seite (ohne Login, für Suchmaschinen
            auffindbar). Es werden nur öffentliche Sportdaten übernommen — keine
            Personen.{" "}
            <Link href="/hilfe#oeffentliche-seite" className="font-medium underline">
              Anleitung: So richtet ihr die öffentliche Seite ein
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ligaVerein && (
            <p className="text-sm">
              Eure Seite:{" "}
              <Link href={`/verein/${ligaVerein.slug}`} className="underline">
                /verein/{ligaVerein.slug}
              </Link>
              {ligaVerein.spieleSynchronisiertAm && (
                <span className="text-muted-foreground">
                  {" "}
                  · zuletzt aktualisiert{" "}
                  {ligaVerein.spieleSynchronisiertAm.toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                  })}
                </span>
              )}
            </p>
          )}
          <form action={oeffentlicheSeiteSpeichern} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nuligaClubId">nuLiga-Vereins-ID</Label>
              <Input
                id="nuligaClubId"
                name="nuligaClubId"
                inputMode="numeric"
                placeholder="z.B. 69723"
                defaultValue={ligaVerein?.nuligaClubId ?? ""}
                disabled={!session.user.istAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Die Zahl hinter <code>club=</code> in der Adresse eurer Vereinsseite auf nuLiga
                (z.B. <code>…clubTeams?club=69723</code>). Optional, wenn ihr nur handball.net nutzt.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handballNetClubId">handball.net-Vereins-ID (DHB-Wettbewerbe)</Label>
              <Input
                id="handballNetClubId"
                name="handballNetClubId"
                placeholder="z.B. 0b8y490"
                defaultValue={ligaVerein?.handballNetClubId ?? ""}
                disabled={!session.user.istAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Der Teil hinter <code>/club/</code> in der Adresse eures Vereins auf handball.net
                (z.B. <code>handball.net/club/0b8y490</code>). Mannschaften der 3. Liga,
                Jugendbundesliga u.ä. erscheinen dann zusammen mit den nuLiga-Mannschaften.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handballNetTeamIds">handball.net-Team-IDs (optional)</Label>
              <Input
                id="handballNetTeamIds"
                name="handballNetTeamIds"
                placeholder="z.B. 69770, 69771"
                defaultValue={ligaVerein?.handballNetTeamIds ?? ""}
                disabled={!session.user.istAdmin}
              />
              <p className="text-xs text-muted-foreground">
                Nur nötig, falls die Mannschaften nicht automatisch gefunden werden: die Zahl
                hinter <code>/team/</code> in der Adresse der Mannschaft.
              </p>
            </div>
            {session.user.istAdmin && (
              <SubmitButton size="sm" className="self-start" pendingText="Lädt von nuLiga/handball.net… (bis ca. 1 Minute)">
                {ligaVerein ? "Jetzt aktualisieren" : "Speichern & Seite erstellen"}
              </SubmitButton>
            )}
          </form>
          {ligaVerein && (
            <div className="flex flex-col gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/verein/${ligaVerein.slug}/logo?v=${logo.aktualisiertAm.getTime()}`}
                    alt="Vereinslogo"
                    width={56}
                    height={56}
                    className="size-14 rounded-xl border bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-xl border bg-muted text-xs text-muted-foreground">
                    Kein Logo
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Das Logo erscheint im Kopf eurer öffentlichen Seite und als Icon der Web-App
                  (PNG, JPEG oder WebP, max. 5 MB, am besten quadratisch).
                </p>
              </div>
              {session.user.istAdmin && (
                <>
                  <form action={logoHochladen} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required />
                    <SubmitButton size="sm" pendingText="Lädt hoch…" className="self-start">
                      {logo ? "Logo ersetzen" : "Logo hochladen"}
                    </SubmitButton>
                  </form>
                  {logo && (
                    <form action={logoEntfernen}>
                      <ConfirmSubmitButton
                        variant="outline"
                        size="sm"
                        confirmText="Logo wirklich entfernen? Die Web-App zeigt dann wieder die Initialen."
                      >
                        Logo entfernen
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
          {ligaVerein && ligaMannschaftsListe.length > 0 && (
            <form action={mannschaftsnamenSpeichern} className="flex flex-col gap-3 border-t pt-4">
              <div>
                <h3 className="text-sm font-medium">Namen der Mannschaften</h3>
                <p className="text-xs text-muted-foreground">
                  Standard ist der Name aus der Quelle (nuLiga/handball.net). Hier könnt ihr ihn
                  für die öffentliche Seite anpassen, z.B. „Männer II“ zu „Männer 1“. Leer lassen
                  = Standardname. Die Adresse der Mannschaftsseite ändert sich dabei nicht.
                </p>
              </div>
              {ligaMannschaftsListe.map((m) => (
                <div key={m.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={`name_${m.id}`} className="text-xs font-normal text-muted-foreground">
                    Standard: {m.name}
                  </Label>
                  <Input
                    id={`name_${m.id}`}
                    name={`name_${m.id}`}
                    defaultValue={m.anzeigenameEigen ?? ""}
                    placeholder={m.name}
                    maxLength={60}
                    disabled={!session.user.istAdmin}
                  />
                </div>
              ))}
              {session.user.istAdmin && (
                <SubmitButton size="sm" className="self-start" pendingText="Wird gespeichert…">
                  Namen speichern
                </SubmitButton>
              )}
            </form>
          )}
          {ligaVerein && session.user.istAdmin && (
            <form action={oeffentlicheSeiteEntfernen}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmText="Öffentliche Vereinsseite wirklich entfernen? Favoriten dazu gehen verloren."
              >
                Seite entfernen
              </ConfirmSubmitButton>
            </form>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dienste-Bedarf pro Termin</CardTitle>
            <CardDescription>
              Wie viele Ordner-, Kioskdienst-, Kassierer- und Zeitnehmer/
              Sekretär-Kräfte pro Freundschaftsspiel, Turnier bzw. Rundenspiel
              benötigt werden.
              Sobald diese Anzahl erreicht ist, können sich weitere
              Interessenten nicht mehr anmelden. Gilt nicht für Termine aus dem
              ICS-Feed (das sind die persönlichen Einsätze der Schiedsrichter).
              Zeitnehmer und Sekretär sind dabei jeweils eigene Rollen mit
              fest max. einer Person — der hier eingetragene Bedarf zählt
              beide zusammen (z.B. 2 = ein Zeitnehmer UND ein Sekretär).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={dienstBedarfSpeichern} className="flex flex-col gap-5">
              <fieldset
                disabled={!session.user.istAdmin}
                className="flex flex-col gap-2"
              >
                <legend className="mb-1 text-sm font-medium">Freundschaftsspiele</legend>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="testspielOrdnerBedarf" className="font-normal">
                    Ordner
                  </Label>
                  <Input
                    id="testspielOrdnerBedarf"
                    type="number"
                    name="testspielOrdnerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielOrdnerBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="testspielKioskdienstBedarf"
                    className="font-normal"
                  >
                    Kioskdienst
                  </Label>
                  <Input
                    id="testspielKioskdienstBedarf"
                    type="number"
                    name="testspielKioskdienstBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielKioskdienstBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="testspielKassiererBedarf" className="font-normal">
                    Kassierer
                  </Label>
                  <Input
                    id="testspielKassiererBedarf"
                    type="number"
                    name="testspielKassiererBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielKassiererBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="testspielZeitnehmerBedarf"
                    className="font-normal"
                  >
                    Zeitnehmer/Sekretär
                  </Label>
                  <Input
                    id="testspielZeitnehmerBedarf"
                    type="number"
                    name="testspielZeitnehmerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.testspielZeitnehmerBedarf ?? 1}
                    className="w-20"
                  />
                </div>
              </fieldset>

              <fieldset
                disabled={!session.user.istAdmin}
                className="flex flex-col gap-2"
              >
                <legend className="mb-1 text-sm font-medium">Turniere</legend>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="turnierOrdnerBedarf" className="font-normal">
                    Ordner
                  </Label>
                  <Input
                    id="turnierOrdnerBedarf"
                    type="number"
                    name="turnierOrdnerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierOrdnerBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="turnierKioskdienstBedarf"
                    className="font-normal"
                  >
                    Kioskdienst
                  </Label>
                  <Input
                    id="turnierKioskdienstBedarf"
                    type="number"
                    name="turnierKioskdienstBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierKioskdienstBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="turnierKassiererBedarf" className="font-normal">
                    Kassierer
                  </Label>
                  <Input
                    id="turnierKassiererBedarf"
                    type="number"
                    name="turnierKassiererBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierKassiererBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="turnierZeitnehmerBedarf"
                    className="font-normal"
                  >
                    Zeitnehmer/Sekretär
                  </Label>
                  <Input
                    id="turnierZeitnehmerBedarf"
                    type="number"
                    name="turnierZeitnehmerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.turnierZeitnehmerBedarf ?? 1}
                    className="w-20"
                  />
                </div>
              </fieldset>

              <fieldset
                disabled={!session.user.istAdmin}
                className="flex flex-col gap-2"
              >
                <legend className="mb-1 text-sm font-medium">Hallenspielplan</legend>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rundenspielOrdnerBedarf" className="font-normal">
                    Ordner
                  </Label>
                  <Input
                    id="rundenspielOrdnerBedarf"
                    type="number"
                    name="rundenspielOrdnerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielOrdnerBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="rundenspielKioskdienstBedarf"
                    className="font-normal"
                  >
                    Kioskdienst
                  </Label>
                  <Input
                    id="rundenspielKioskdienstBedarf"
                    type="number"
                    name="rundenspielKioskdienstBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielKioskdienstBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="rundenspielKassiererBedarf" className="font-normal">
                    Kassierer
                  </Label>
                  <Input
                    id="rundenspielKassiererBedarf"
                    type="number"
                    name="rundenspielKassiererBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielKassiererBedarf ?? 0}
                    className="w-20"
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="rundenspielZeitnehmerBedarf"
                    className="font-normal"
                  >
                    Zeitnehmer/Sekretär
                  </Label>
                  <Input
                    id="rundenspielZeitnehmerBedarf"
                    type="number"
                    name="rundenspielZeitnehmerBedarf"
                    min="0"
                    step="1"
                    defaultValue={verein?.rundenspielZeitnehmerBedarf ?? 1}
                    className="w-20"
                  />
                </div>
              </fieldset>

              <fieldset disabled={!session.user.istAdmin} className="contents">
                <div className="flex items-center justify-between gap-3 border-t pt-4">
                  <div>
                    <Label
                      htmlFor="offeneDiensteBroadcastAktiviert"
                      className="font-normal"
                    >
                      Bei unbesetztem Dienst (3 Tage vorher) alle
                      Rolleninhaber per Mail fragen
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Zusätzlich zur bestehenden Erinnerung an euch als
                      Admin — geht an ALLE aktiven Personen mit der
                      betroffenen Rolle (Ordner/Kioskdienst/Kassierer/
                      Zeitnehmer/Sekretär), nicht nur an bereits
                      Zugeordnete. Einzelne Personen können das für sich
                      selbst in ihren eigenen Benachrichtigungs-
                      Einstellungen wieder abschalten.
                    </p>
                  </div>
                  <Switch
                    key={String(verein?.offeneDiensteBroadcastAktiviert ?? false)}
                    id="offeneDiensteBroadcastAktiviert"
                    name="offeneDiensteBroadcastAktiviert"
                    defaultChecked={verein?.offeneDiensteBroadcastAktiviert ?? false}
                  />
                </div>
              </fieldset>

              {session.user.istAdmin && (
                <SubmitButton className="w-full">Speichern</SubmitButton>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>nuLiga Automatischer Import</CardTitle>
            <CardDescription>
              Bis zu drei Hallen-IDs eintragen (leere Felder werden
              übersprungen) — dieselben Angaben wie im bisherigen manuellen
              Export-Workflow. Bei aktiviertem Import lädt der Verein montags
              und donnerstags automatisch neue Spiele in den Hallenspielplan; nach dem
              Speichern läuft sofort ein erster Sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Woher bekomme ich die Hallen-ID?
              </p>
              <p className="mt-1">
                Die ID steht nicht sichtbar auf der Seite, sondern nur in der
                Adresszeile des Browsers: Sucht eure Halle im Spielbetrieb des
                Verbands (z.B. auf{" "}
                <a
                  href="https://hhv-handball.liga.nu"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  hhv-handball.liga.nu
                </a>{" "}
                unter „Hallen“ oder „Spielbetrieb“), öffnet die Hallenseite und
                lest die Zahl hinter <code>location=</code> in der URL ab —
                z.B. bei{" "}
                <code>...courtInfo?federation=HHV&amp;location=30402</code>{" "}
                ist die Hallen-ID <code>30402</code>.
              </p>
              <p className="mt-2">
                <Link href="/hilfe" className="underline">
                  Mehr dazu (inkl. Unterschied zur handball.net-Team-ID ab
                  der 3. Liga)
                </Link>
              </p>
            </div>
            <form
              action={nuligaEinstellungenSpeichern}
              className="flex flex-col gap-4"
            >
            <fieldset
              disabled={!session.user.istAdmin}
              className="contents"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaHalle1Id">Halle 1</Label>
                <Input
                  id="nuligaHalle1Id"
                  name="nuligaHalle1Id"
                  inputMode="numeric"
                  placeholder="z.B. 30402"
                  defaultValue={verein?.nuligaHalle1Id ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaHalle2Id">Halle 2</Label>
                <Input
                  id="nuligaHalle2Id"
                  name="nuligaHalle2Id"
                  inputMode="numeric"
                  placeholder="optional"
                  defaultValue={verein?.nuligaHalle2Id ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nuligaHalle3Id">Halle 3</Label>
                <Input
                  id="nuligaHalle3Id"
                  name="nuligaHalle3Id"
                  inputMode="numeric"
                  placeholder="optional"
                  defaultValue={verein?.nuligaHalle3Id ?? ""}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="nuligaAutoImportAktiviert" className="font-normal">
                  Automatischer Import aktiv (Mo + Do)
                </Label>
                <Switch
                  key={String(verein?.nuligaAutoImportAktiviert ?? false)}
                  id="nuligaAutoImportAktiviert"
                  name="nuligaAutoImportAktiviert"
                  defaultChecked={verein?.nuligaAutoImportAktiviert ?? false}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="rundenspielAenderungenBenachrichtigungAktiviert"
                  className="font-normal"
                >
                  Benachrichtigung bei verlegten Spielen/neuen Ergebnissen
                </Label>
                <Switch
                  key={String(
                    verein?.rundenspielAenderungenBenachrichtigungAktiviert ?? false
                  )}
                  id="rundenspielAenderungenBenachrichtigungAktiviert"
                  name="rundenspielAenderungenBenachrichtigungAktiviert"
                  defaultChecked={
                    verein?.rundenspielAenderungenBenachrichtigungAktiviert ?? false
                  }
                />
              </div>
            </fieldset>
              {session.user.istAdmin && (
                <SubmitButton
                  className="w-full"
                  pendingText="Synchronisiert…"
                >
                  Speichern{verein?.nuligaAutoImportAktiviert ? " & synchronisieren" : ""}
                </SubmitButton>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rechtliches</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <Link href="/admin/avv" className="underline">
              Auftragsverarbeitungsvertrag (AVV) ansehen
            </Link>
            <Link href="/datenschutz" className="underline">
              Datenschutzerklärung
            </Link>
          </CardContent>
        </Card>
      </div>

      {session.user.istAdmin && verein && (
        <Card className="max-w-2xl border-destructive/50">
          <CardHeader>
            <CardTitle>Gefahrenzone</CardTitle>
            <CardDescription>
              Löscht den gesamten Verein samt aller Funktionsträger,
              Mannschaften, Termine und Historie — unwiderruflich.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VereinLoeschenDialog vereinsname={verein.name} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
