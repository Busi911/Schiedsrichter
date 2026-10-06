"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { SubmitButton } from "@/components/submit-button";
import { formatDatumZeit as formatDateTime } from "@/lib/format";

type DialogSchluessel = "kalender" | "stammdaten" | "benachrichtigungen" | "ics";

// Bündelt alle bisher einzeln als Karte "Einstellungen" sichtbaren Formulare
// hinter EINEM Zahnrad-Symbol im Header statt eigener Buttons/Karte — sonst
// wächst der Header für Admins (die zusätzlich schon Admin-/Wart-Buttons
// haben) und die Profilseite für alle anderen mit jeder weiteren
// Einstellung weiter. Ein Menüpunkt setzt lediglich, welcher der unten
// stehenden (weiterhin unveränderten) Dialoge offen ist — das Menü selbst
// schließt sich beim Klick, unabhängig vom danach geöffneten Dialog, da
// beide unabhängige, nur durch diesen lokalen State verbundene Base-UI-
// Komponenten sind (kein DialogTrigger nötig).
export function ProfilEinstellungenMenu({
  kalenderAboLink,
  kalenderWebcalLink,
  name,
  telefonnummer,
  email,
  pendingEmail,
  wochenDigestAktiviert,
  terminErinnerungAktiviert,
  offeneSchiedsrichterErinnerungAktiviert,
  offeneZeitnehmerErinnerungAktiviert,
  offeneDiensteBroadcastAktiviert,
  istSchiedsrichterwart,
  istZeitnehmerwart,
  istDienstRolleninhaber,
  istSchiedsrichter,
  icsFeedUrl,
  letzterSyncAm,
  letzterSyncStatus,
  saisonLabelText,
  kalenderLinkErneuern,
  kalenderLinkDeaktivieren,
  updateStammdaten,
  emailAendernAnfordern,
  emailAenderungAbbrechen,
  updateBenachrichtigungen,
  updateIcsFeedUrl,
  syncJetzt,
  liste = false,
}: {
  // Mobil: statt Zahnrad-Menü eine Liste (Karte) am Seitenende, die dieselben Dialoge öffnet.
  liste?: boolean;
  kalenderAboLink: string | null;
  kalenderWebcalLink: string | null;
  name: string;
  telefonnummer: string | null;
  email: string;
  pendingEmail: string | null;
  wochenDigestAktiviert: boolean;
  terminErinnerungAktiviert: boolean;
  offeneSchiedsrichterErinnerungAktiviert: boolean;
  offeneZeitnehmerErinnerungAktiviert: boolean;
  offeneDiensteBroadcastAktiviert: boolean;
  istSchiedsrichterwart: boolean;
  istZeitnehmerwart: boolean;
  istDienstRolleninhaber: boolean;
  istSchiedsrichter: boolean;
  icsFeedUrl: string | null;
  letzterSyncAm: Date | null;
  letzterSyncStatus: string | null;
  saisonLabelText: string;
  kalenderLinkErneuern: () => Promise<void>;
  kalenderLinkDeaktivieren: () => Promise<void>;
  updateStammdaten: (formData: FormData) => Promise<void>;
  emailAendernAnfordern: (formData: FormData) => Promise<void>;
  emailAenderungAbbrechen: () => Promise<void>;
  updateBenachrichtigungen: (formData: FormData) => Promise<void>;
  updateIcsFeedUrl: (formData: FormData) => Promise<void>;
  syncJetzt: () => Promise<void>;
}) {
  const [offen, setOffen] = useState<DialogSchluessel | null>(null);
  const eintraege = [
    ["kalender", "Kalender abonnieren"],
    ["stammdaten", "Stammdaten"],
    ["benachrichtigungen", "Benachrichtigungen"],
    ...(istSchiedsrichter ? ([["ics", "HHV Funktionsträger ICS-Feed"]] as const) : []),
  ] as const;

  return (
    <>
      {liste ? (
        <section id="einstellungen" className="rounded-xl border bg-card p-2">
          <h2 className="px-3 py-2 font-heading text-base font-semibold">Einstellungen</h2>
          {eintraege.map(([schluessel, text]) => (
            <button
              key={schluessel}
              type="button"
              onClick={() => setOffen(schluessel)}
              className="flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-muted"
            >
              {text}
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </button>
          ))}
        </section>
      ) : (
      <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Einstellungen"
            className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
          >
            <SettingsIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setOffen("kalender")}>
              Kalender abonnieren
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOffen("stammdaten")}>
              Stammdaten
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOffen("benachrichtigungen")}>
              Benachrichtigungen
            </DropdownMenuItem>
            {istSchiedsrichter && (
              <DropdownMenuItem onClick={() => setOffen("ics")}>
                HHV Funktionsträger ICS-Feed
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog
        open={offen === "kalender"}
        onOpenChange={(o) => setOffen(o ? "kalender" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kalender abonnieren</DialogTitle>
            <DialogDescription>
              Abo-Link für Apple/Google/Outlook Kalender &amp; Co. —
              dieselben Termine wie oben, automatisch aktuell gehalten, ohne
              dass du hier vorbeischauen musst.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {kalenderAboLink ? (
              <>
                <p className="break-all rounded-lg border bg-muted/40 p-3 text-sm">
                  {kalenderAboLink}
                </p>
                {/* webcal:// statt https:// — auf iPhone/iPad/Mac öffnet das
                    Antippen direkt den "Abonnement hinzufügen"-Dialog der
                    Kalender-App, siehe ausführlicher Kommentar an der
                    ursprünglichen Stelle in profil/page.tsx (git-history). */}
                <a
                  href={kalenderWebcalLink ?? undefined}
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
                {/* Langer Label-Text erzwang auf schmalen Bildschirmen
                    horizontales Scrollen der ganzen Seite (Button-
                    Basisklasse ist whitespace-nowrap) — siehe gleicher
                    Kommentar in profil/zeitnehmerwart/page.tsx. */}
                {kalenderAboLink ? (
                  <ConfirmSubmitButton
                    confirmText="Neuen Link generieren? Der bisherige Link funktioniert danach nicht mehr."
                    variant="outline"
                    size="sm"
                  >
                    Link neu generieren
                  </ConfirmSubmitButton>
                ) : (
                  <SubmitButton variant="outline" size="sm">
                    Aktivieren
                  </SubmitButton>
                )}
              </form>
              {kalenderAboLink && (
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

      <Dialog
        open={offen === "stammdaten"}
        onOpenChange={(o) => setOffen(o ? "stammdaten" : null)}
      >
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
              <Input id="name" name="name" defaultValue={name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="telefonnummer">Telefonnummer</Label>
              <Input
                id="telefonnummer"
                name="telefonnummer"
                type="tel"
                defaultValue={telefonnummer ?? ""}
                placeholder="optional"
              />
            </div>
            <p className="text-sm text-muted-foreground">E-Mail: {email}</p>
            <SubmitButton>Speichern</SubmitButton>
          </form>

          <div className="flex flex-col gap-2 border-t pt-4">
            {pendingEmail ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Änderung zu <strong>{pendingEmail}</strong> ausstehend —
                  Bestätigungslink wurde an diese Adresse geschickt.
                </p>
                <form action={emailAenderungAbbrechen}>
                  <SubmitButton variant="ghost" size="sm">
                    Änderung abbrechen
                  </SubmitButton>
                </form>
              </>
            ) : (
              <form
                action={emailAendernAnfordern}
                className="flex flex-col gap-2"
              >
                <Label htmlFor="neueEmail">E-Mail-Adresse ändern</Label>
                <Input
                  id="neueEmail"
                  name="neueEmail"
                  type="email"
                  placeholder="neue@adresse.de"
                  required
                />
                <SubmitButton variant="outline" size="sm">
                  Bestätigungslink anfordern
                </SubmitButton>
              </form>
            )}
          </div>

          <Link
            href="/profil/passwort-aendern"
            className="inline-block text-sm text-muted-foreground underline"
          >
            Passwort ändern
          </Link>
        </DialogContent>
      </Dialog>

      <Dialog
        open={offen === "benachrichtigungen"}
        onOpenChange={(o) => setOffen(o ? "benachrichtigungen" : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>E-Mail-Benachrichtigungen</DialogTitle>
            <DialogDescription>
              Welche automatischen Erinnerungs-Mails du bekommen möchtest.
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
                key={String(wochenDigestAktiviert)}
                id="wochenDigestAktiviert"
                name="wochenDigestAktiviert"
                defaultChecked={wochenDigestAktiviert}
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
                key={String(terminErinnerungAktiviert)}
                id="terminErinnerungAktiviert"
                name="terminErinnerungAktiviert"
                defaultChecked={terminErinnerungAktiviert}
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
                  key={String(offeneSchiedsrichterErinnerungAktiviert)}
                  id="offeneSchiedsrichterErinnerungAktiviert"
                  name="offeneSchiedsrichterErinnerungAktiviert"
                  defaultChecked={offeneSchiedsrichterErinnerungAktiviert}
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
                  key={String(offeneZeitnehmerErinnerungAktiviert)}
                  id="offeneZeitnehmerErinnerungAktiviert"
                  name="offeneZeitnehmerErinnerungAktiviert"
                  defaultChecked={offeneZeitnehmerErinnerungAktiviert}
                />
              </div>
            )}
            {istDienstRolleninhaber && (
              <div className="flex items-center justify-between gap-3">
                <Label
                  htmlFor="offeneDiensteBroadcastAktiviert"
                  className="font-normal"
                >
                  Anfrage, wenn deine Dienst-Rolle (Ordner/Kioskdienst/
                  Kassierer/Zeitnehmer/Sekretär) kurzfristig noch gesucht
                  wird
                </Label>
                <Switch
                  key={String(offeneDiensteBroadcastAktiviert)}
                  id="offeneDiensteBroadcastAktiviert"
                  name="offeneDiensteBroadcastAktiviert"
                  defaultChecked={offeneDiensteBroadcastAktiviert}
                />
              </div>
            )}
            <SubmitButton className="w-full">Speichern</SubmitButton>
          </form>
        </DialogContent>
      </Dialog>

      {istSchiedsrichter && (
        <Dialog
          open={offen === "ics"}
          onOpenChange={(o) => setOffen(o ? "ics" : null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>HHV Funktionsträger ICS-Feed (Spielansetzungen)</DialogTitle>
              <DialogDescription>
                Abo-Link deines Verbands hinterlegen, damit deine Einsätze
                automatisch synchronisiert werden. Aktuelle Spielzeit:{" "}
                <strong>Saison {saisonLabelText}</strong>.{" "}
                <Link href="/hilfe#ics-feed" className="underline">
                  Wo finde ich diesen Link?
                </Link>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <form action={updateIcsFeedUrl} className="flex flex-col gap-3">
                <Label htmlFor="icsFeedUrl">ICS-Feed-URL</Label>
                <Input
                  id="icsFeedUrl"
                  name="icsFeedUrl"
                  type="url"
                  defaultValue={icsFeedUrl ?? ""}
                  placeholder="https://.../schiedsrichter.ics"
                />
                <SubmitButton>Speichern</SubmitButton>
              </form>

              <form action={syncJetzt}>
                <SubmitButton variant="outline" className="w-full">
                  Jetzt synchronisieren
                </SubmitButton>
              </form>

              {letzterSyncAm && (
                <p className="text-sm text-muted-foreground">
                  Letzter Sync: {formatDateTime(letzterSyncAm)} (
                  {letzterSyncStatus})
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
