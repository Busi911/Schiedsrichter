"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingsIcon } from "lucide-react";
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
  wochenDigestAktiviert,
  terminErinnerungAktiviert,
  offeneSchiedsrichterErinnerungAktiviert,
  offeneZeitnehmerErinnerungAktiviert,
  istSchiedsrichterwart,
  istZeitnehmerwart,
  istSchiedsrichter,
  icsFeedUrl,
  letzterSyncAm,
  letzterSyncStatus,
  saisonLabelText,
  kalenderLinkErneuern,
  kalenderLinkDeaktivieren,
  updateStammdaten,
  updateBenachrichtigungen,
  updateIcsFeedUrl,
  syncJetzt,
}: {
  kalenderAboLink: string | null;
  kalenderWebcalLink: string | null;
  name: string;
  telefonnummer: string | null;
  email: string;
  wochenDigestAktiviert: boolean;
  terminErinnerungAktiviert: boolean;
  offeneSchiedsrichterErinnerungAktiviert: boolean;
  offeneZeitnehmerErinnerungAktiviert: boolean;
  istSchiedsrichterwart: boolean;
  istZeitnehmerwart: boolean;
  istSchiedsrichter: boolean;
  icsFeedUrl: string | null;
  letzterSyncAm: Date | null;
  letzterSyncStatus: string | null;
  saisonLabelText: string;
  kalenderLinkErneuern: () => Promise<void>;
  kalenderLinkDeaktivieren: () => Promise<void>;
  updateStammdaten: (formData: FormData) => Promise<void>;
  updateBenachrichtigungen: (formData: FormData) => Promise<void>;
  updateIcsFeedUrl: (formData: FormData) => Promise<void>;
  syncJetzt: () => Promise<void>;
}) {
  const [offen, setOffen] = useState<DialogSchluessel | null>(null);

  return (
    <>
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
              ICS-Feed
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
                <SubmitButton variant="outline" size="sm">
                  {kalenderAboLink
                    ? "Link neu generieren (alter Link wird ungültig)"
                    : "Aktivieren"}
                </SubmitButton>
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
              <DialogTitle>ICS-Feed (Spielansetzungen)</DialogTitle>
              <DialogDescription>
                Abo-Link deines Verbands hinterlegen, damit deine Einsätze
                automatisch synchronisiert werden. Aktuelle Spielzeit:{" "}
                <strong>Saison {saisonLabelText}</strong>.
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
