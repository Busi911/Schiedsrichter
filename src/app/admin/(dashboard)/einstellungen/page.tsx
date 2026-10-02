import { and, asc, desc, eq } from "drizzle-orm";
import { holeProtokoll, supportFreigabeAktiv } from "@/lib/treuhand";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { adminDb } from "@/db/admin";
import { ligaMannschaften, ligaVereine, ligaSyncLaeufe, ligaVereinLogos, ligaVereinZusatzquellen, vereine } from "@/db/schema";
import {
  dienstBedarfSpeichern,
  logoEntfernen,
  mannschaftsnamenSpeichern,
  supportZugriffSetzen,
  logoHochladen,
  oeffentlicheSeiteEntfernen,
  oeffentlicheSeiteSpeichern,
  zusatzquelleEntfernen,
  zusatzquelleHinzufuegen,
  nuligaEinstellungenSpeichern,
  eigeneHallenNamenSpeichern,
  vereinsdatenSpeichern,
} from "./actions";
import { ChevronDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SubmitButton } from "@/components/submit-button";
import { EinstellungsBereich, Unterbereich } from "@/components/einstellungs-bereich";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { VereinLoeschenDialog } from "@/components/verein-loeschen-dialog";
import { LigaAutoWeiter } from "@/components/liga-auto-weiter";

// Der erste Sync der öffentlichen Vereinsseite fragt nuLiga bewusst langsam
// ab (siehe lib/nuliga/client.ts) und braucht dafür mehr als das Standard-
// Zeitlimit einer Server Action.
export const maxDuration = 60;

const PROTOKOLL_LABEL: Record<string, string> = {
  vorbereitet: "Verein vorbereitet",
  einrichtung_gestartet: "Einrichtung durch den Systemadmin",
  uebergeben: "An den Vereinsadmin übergeben",
  support_freigegeben: "Support-Zugriff freigegeben",
  support_widerrufen: "Support-Zugriff widerrufen",
  support_zugriff: "Support-Zugriff genutzt",
};

const ZUSATZ_KATEGORIE_LABEL: Record<string, string> = {
  jugend_weiblich: "Weibliche Jugend",
  jugend_maennlich: "Männliche Jugend",
  damen: "Frauen",
  herren: "Männer",
  kinder: "Kinder",
};

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

  const zusatzquellen = ligaVerein
    ? await adminDb.query.ligaVereinZusatzquellen.findMany({
        where: eq(ligaVereinZusatzquellen.ligaVereinId, ligaVerein.id),
        orderBy: [asc(ligaVereinZusatzquellen.erstelltAm)],
      })
    : [];

  // Letzte Sync-Läufe: bleiben sichtbar, auch wenn der Ergebnisbalken nach dem
  // Klick (URL-Parameter) nicht erscheint oder die Seite neu geladen wurde.
  const syncLaeufe = ligaVerein
    ? await adminDb.query.ligaSyncLaeufe.findMany({
        where: eq(ligaSyncLaeufe.ligaVereinId, ligaVerein.id),
        orderBy: [desc(ligaSyncLaeufe.gestartetAm)],
        limit: 4,
      })
    : [];

  const protokoll = await holeProtokoll(vereinId, 8);
  const supportAktiv = supportFreigabeAktiv(verein?.supportZugriffBis ?? null);

  const ligaMannschaftsListe = ligaVerein
    ? await adminDb.query.ligaMannschaften.findMany({
        where: and(eq(ligaMannschaften.ligaVereinId, ligaVerein.id), eq(ligaMannschaften.aktiv, true)),
        orderBy: [asc(ligaMannschaften.kategorie), asc(ligaMannschaften.altersklasse), asc(ligaMannschaften.nummer)],
      })
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-2">
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

      <EinstellungsBereich titel="Vereinsdaten" kurz="Adresse und Kontaktdaten des Vereins" beschreibung={<>Wird aktuell nur informativ hinterlegt (z.B. für spätere
            Rechnungen) — bislang nirgends in der App sichtbar.</>}>
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
        </EinstellungsBereich>

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

      <EinstellungsBereich titel="Support-Zugriff" kurz="Befristete Freigabe für den Support, Protokoll" beschreibung={<>Standardmäßig kommt niemand vom HandballerPate-Support in euren Verein. Wenn ihr Hilfe
            braucht, könnt ihr den Zugriff ausdrücklich und befristet freigeben und jederzeit
            wieder widerrufen. Jeder Zugriff wird unten protokolliert.</>}>
          <p className="text-sm">
            {supportAktiv
              ? `Freigegeben bis ${verein!.supportZugriffBis!.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" })}.`
              : "Aktuell nicht freigegeben."}
          </p>
          {session.user.istAdmin && !session.user.treuhand && (
            <div className="flex flex-wrap gap-2">
              {[1, 3, 7].map((tage) => (
                <form key={tage} action={supportZugriffSetzen}>
                  <input type="hidden" name="tage" value={tage} />
                  <SubmitButton size="sm" variant="outline" pendingText="Wird gespeichert…">
                    {tage === 1 ? "1 Tag freigeben" : `${tage} Tage freigeben`}
                  </SubmitButton>
                </form>
              ))}
              {supportAktiv && (
                <form action={supportZugriffSetzen}>
                  <input type="hidden" name="tage" value="widerrufen" />
                  <SubmitButton size="sm" variant="outline" pendingText="Wird widerrufen…">
                    Jetzt widerrufen
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
          {protokoll.length > 0 && (
            <div className="flex flex-col gap-1 border-t pt-3">
              <h3 className="text-sm font-medium">Protokoll</h3>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {protokoll.map((p) => (
                  <li key={p.id}>
                    {p.zeitpunkt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}{" "}
                    · {PROTOKOLL_LABEL[p.aktion] ?? p.aktion}
                    {p.akteur ? ` (${p.akteur})` : ""}
                    {p.details ? ` · ${p.details}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </EinstellungsBereich>

      <EinstellungsBereich titel="Öffentliche Vereinsseite" kurz="Ligadaten aus nuLiga und handball.net, Namen, Logo" beschreibung={<>Zeigt Mannschaften, Spielpläne, Ergebnisse und Tabellen eures Vereins
            aus nuLiga und handball.net auf einer öffentlichen Seite (ohne Login, für Suchmaschinen
            auffindbar). Es werden nur öffentliche Sportdaten übernommen — keine
            Personen.{" "}
            <Link href="/hilfe#oeffentliche-seite" className="font-medium underline">
              Anleitung: So richtet ihr die öffentliche Seite ein
            </Link></>} offen>
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
          {syncLaeufe.length > 0 && (
            <details className="rounded-lg border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">
                Letzte Synchronisationen
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · zuletzt {syncLaeufe[0].status} (
                  {syncLaeufe[0].gestartetAm.toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                  )
                </span>
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {syncLaeufe.map((l) => (
                  <li key={l.id} className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0">
                    <span>
                      {l.gestartetAm.toLocaleString("de-DE", {
                        timeZone: "Europe/Berlin",
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}{" "}
                      · {l.art} · <strong>{l.status}</strong> · {l.neu} neu, {l.aktualisiert} aktualisiert,{" "}
                      {l.anfragen} Abrufe
                    </span>
                    {l.meldungen.slice(0, 8).map((m, i) => (
                      <span key={i} className="text-xs text-muted-foreground">
                        {m}
                      </span>
                    ))}
                    {l.meldungen.length > 8 && (
                      <span className="text-xs text-muted-foreground">… und {l.meldungen.length - 8} weitere</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Unterbereich titel="Quellen und Vereins-IDs" kurz="nuLiga, handball.net, Team-IDs — hier aktualisieren" offen>
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
                Nur nötig, falls die Mannschaften nicht automatisch gefunden werden — oder für eine
                Spielgemeinschaft, die bei handball.net unter einem Partnerverein läuft (z.B. eine
                Jugendspielgemeinschaft in der Jugendbundesliga): die Zahl hinter <code>/team/</code> in
                der Adresse der Mannschaft. Hier eingetragene Teams werden immer übernommen, auch wenn
                sie zu einem anderen Verein gehören.
              </p>
            </div>
            {session.user.istAdmin && (
              <SubmitButton size="sm" className="self-start" pendingText="Lädt von nuLiga/handball.net… (bis ca. 1 Minute)">
                {ligaVerein ? "Jetzt aktualisieren" : "Speichern & Seite erstellen"}
              </SubmitButton>
            )}
          </form>
          </Unterbereich>
          {ligaVerein && (
            <Unterbereich
              titel="Weitere nuLiga-Vereine (z.B. Spielgemeinschaft)"
              kurz={zusatzquellen.length ? `${zusatzquellen.length} angebunden` : "Mannschaften aus einem Partnerverein übernehmen"}
            >
              <p className="text-xs text-muted-foreground">
                Läuft eine Mannschaft in nuLiga unter einem Partnerverein (z.B. eine Jugendspielgemeinschaft),
                tragt hier dessen Vereins-ID ein (nuLiga oder handball.net). Übernommen werden nur die Mannschaften, die zum
                Filter passen — der Rest des Partnervereins nicht.
              </p>
              {zusatzquellen.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {zusatzquellen.map((z) => (
                    <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{z.bezeichnung || `Verein ${z.nuligaClubId ?? z.handballNetClubId}`}</span>{" "}
                        <span className="text-muted-foreground">
                          ({z.handballNetClubId ? "handball.net" : "nuLiga"}-ID {z.nuligaClubId ?? z.handballNetClubId}) ·{" "}
                          {[
                            ...z.kategorien
                              .split(",")
                              .filter(Boolean)
                              .map((k) => ZUSATZ_KATEGORIE_LABEL[k] ?? k),
                            z.nameEnthaelt ? `Name enthält „${z.nameEnthaelt}“` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </span>
                      {session.user.istAdmin && (
                        <form action={zusatzquelleEntfernen}>
                          <input type="hidden" name="id" value={z.id} />
                          <ConfirmSubmitButton
                            variant="outline"
                            size="sm"
                            confirmText="Diesen Verein wirklich entfernen? Seine Mannschaften verschwinden von der öffentlichen Seite."
                          >
                            Entfernen
                          </ConfirmSubmitButton>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {session.user.istAdmin && (
                <form action={zusatzquelleHinzufuegen} className="flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="zusatzClubId">Vereins-ID des Partnervereins</Label>
                      <Input id="zusatzClubId" name="zusatzClubId" placeholder="nuLiga: 69692 · handball.net: 0b8y490" required />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="zusatzBezeichnung">Bezeichnung (optional)</Label>
                      <Input id="zusatzBezeichnung" name="zusatzBezeichnung" placeholder="z.B. wJSG Bieber/Heuchelheim" />
                    </div>
                  </div>
                  <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <legend className="mb-1 text-sm">Quelle der ID</legend>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="zusatzQuelle" value="nuliga" defaultChecked /> nuLiga (Landesverband)
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input type="radio" name="zusatzQuelle" value="handball_net" /> handball.net (z.B. Jugendbundesliga)
                    </label>
                  </fieldset>
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="text-sm">Nur diese Mannschaften übernehmen</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {Object.entries(ZUSATZ_KATEGORIE_LABEL).map(([wert, label]) => (
                        <label key={wert} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            name="zusatzKategorie"
                            value={wert}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="zusatzNameEnthaelt">Name enthält (optional)</Label>
                    <Input id="zusatzNameEnthaelt" name="zusatzNameEnthaelt" placeholder="z.B. Heuchelheim" />
                    <p className="text-xs text-muted-foreground">
                      Es reicht ein Teil des Namens (Groß-/Kleinschreibung egal). Geprüft wird gegen den Namen
                      der Mannschaft in der Ligatabelle (dort steht z.B. „wJSG Bieber/Heuchelheim II“) sowie
                      gegen Mannschafts- und Liganame. So werden nur die Mannschaften der Spielgemeinschaft
                      übernommen, nicht weitere Mannschaften des Partnervereins.
                    </p>
                  </div>
                  <SubmitButton size="sm" className="self-start" pendingText="Lädt von nuLiga… (bis ca. 1 Minute)">
                    Hinzufügen &amp; laden
                  </SubmitButton>
                </form>
              )}
            </Unterbereich>
          )}
          {ligaVerein && session.user.istAdmin && (
            <Unterbereich titel="Eure Spielhallen" kurz={verein?.eigeneHallenNamen ? verein.eigeneHallenNamen.split(/\n|,/)[0].trim() + (verein.eigeneHallenNamen.split(/\n|,/).filter((x) => x.trim()).length > 1 ? " u.a." : "") : "Namen eurer Hallen für die Einteilung"}>
            <form action={eigeneHallenNamenSpeichern} className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Damit erkennen wir, welche Spiele in einer eurer Hallen stattfinden (nur für diese wird später
                eine Einteilung angelegt) — unabhängig davon, ob die Spiele aus nuLiga oder handball.net kommen.
              </p>
              <textarea
                id="eigeneHallenNamen"
                name="eigeneHallenNamen"
                rows={2}
                maxLength={500}
                aria-label="Namen eurer Spielhallen"
                placeholder={"z.B. Sporthalle Heuchelheim\nHalle am Seebach"}
                defaultValue={verein?.eigeneHallenNamen ?? ""}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <p className="text-xs text-muted-foreground">
                Eine Halle pro Zeile, ein Teil des Namens reicht (Groß-/Kleinschreibung egal).
              </p>
              <SubmitButton size="sm" className="self-start" pendingText="Wird gespeichert…">
                Hallen speichern
              </SubmitButton>
            </form>
            </Unterbereich>
          )}
          {ligaVerein && (
            <Unterbereich titel="Logo" kurz={logo ? "Logo hinterlegt" : "Kein Logo"}>
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
            </Unterbereich>
          )}
          {ligaVerein && ligaMannschaftsListe.length > 0 && (
            <details className="group border-t pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-sm font-medium">Namen der Mannschaften</span>
                  <span className="block text-xs text-muted-foreground">
                    {ligaMannschaftsListe.length} Mannschaften · Anzeigenamen auf der öffentlichen Seite anpassen
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <form action={mannschaftsnamenSpeichern} className="mt-3 flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                Standard ist der Name aus der Quelle (nuLiga/handball.net). Hier könnt ihr ihn
                für die öffentliche Seite anpassen, z.B. „Männer II“ zu „Männer 1“. Leer lassen
                = Standardname. Die Adresse der Mannschaftsseite ändert sich dabei nicht.
              </p>
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
            </details>
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
        </EinstellungsBereich>

      <div className="flex flex-col gap-3">
        <EinstellungsBereich titel="Dienste-Bedarf pro Termin" kurz="Wie viele Helfer pro Termin gebraucht werden" beschreibung={<>Wie viele Ordner-, Kioskdienst-, Kassierer- und Zeitnehmer/
              Sekretär-Kräfte pro Freundschaftsspiel, Turnier bzw. Rundenspiel
              benötigt werden.
              Sobald diese Anzahl erreicht ist, können sich weitere
              Interessenten nicht mehr anmelden. Gilt nicht für Termine aus dem
              ICS-Feed (das sind die persönlichen Einsätze der Schiedsrichter).
              Zeitnehmer und Sekretär sind dabei jeweils eigene Rollen mit
              fest max. einer Person — der hier eingetragene Bedarf zählt
              beide zusammen (z.B. 2 = ein Zeitnehmer UND ein Sekretär).</>}>
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
          </EinstellungsBereich>

        <EinstellungsBereich titel="nuLiga Automatischer Import" kurz="Hallen-IDs und täglicher Import des Hallenspielplans" beschreibung={<>Bis zu drei Hallen-IDs eintragen (leere Felder werden
              übersprungen) — dieselben Angaben wie im bisherigen manuellen
              Export-Workflow. Bei aktiviertem Import lädt der Verein täglich
              automatisch neue Spiele in den Hallenspielplan; nach dem
              Speichern läuft sofort ein erster Sync.</>}>
            {verein?.hallenplanImportAus ? (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-medium">Der Hallenplan-Import ist für euren Verein abgeschaltet.</p>
                <p className="mt-1">
                  Spielplan, Verlegungen, Ergebnisse und Ansetzung kommen aus den öffentlichen Liga-Daten (eure
                  Vereins-ID). Die Hallen-ID wird nicht mehr gebraucht.{" "}
                  <strong>Freundschaftsspiele und Turniere müssen derzeit von Hand angelegt werden</strong> — die
                  automatische Pflege wird entwickelt.
                </p>
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <p className="font-medium">Wofür brauche ich die Hallen-ID noch?</p>
                <p className="mt-1">
                  Die öffentliche Vereinsseite und der Kalender kommen mit eurer nuLiga- bzw. handball.net-Vereins-ID aus.
                  Die Hallen-ID liefert zusätzlich <strong>Freundschaftsspiele und Turniere</strong> — die sind in den
                  öffentlichen Liga-Daten (noch) nicht enthalten. Die Hallen-ID entfällt künftig; danach müssen
                  Freundschaftsspiele und Turniere von Hand angelegt werden, bis die automatische Pflege fertig ist
                  (in Entwicklung).
                </p>
              </div>
            )}
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
                  Automatischer Import aktiv (täglich)
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
          </EinstellungsBereich>

        <EinstellungsBereich titel="Rechtliches" kurz="AVV und Datenschutzerklärung">
            <Link href="/admin/avv" className="underline">
              Auftragsverarbeitungsvertrag (AVV) ansehen
            </Link>
            <Link href="/datenschutz" className="underline">
              Datenschutzerklärung
            </Link>
          </EinstellungsBereich>
      </div>

      {session.user.istAdmin && verein && (
        <EinstellungsBereich titel="Gefahrenzone" kurz="Verein unwiderruflich löschen" beschreibung={<>Löscht den gesamten Verein samt aller Funktionsträger,
              Mannschaften, Termine und Historie — unwiderruflich.</>} gefahr>
            <VereinLoeschenDialog vereinsname={verein.name} />
          </EinstellungsBereich>
      )}
    </div>
  );
}
