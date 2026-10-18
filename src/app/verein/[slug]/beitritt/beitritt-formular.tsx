"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EinreichErgebnis } from "@/lib/beitritt-daten";
import { beitrittEinreichen } from "./actions";

const SELECT_KLASSE =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function BeitrittFormular({
  slug,
  vereinName,
  satzungUrl,
  mannschaften,
}: {
  slug: string;
  vereinName: string;
  satzungUrl: string | null;
  mannschaften: { id: string; name: string }[];
}) {
  const [ergebnis, formAction] = useActionState<EinreichErgebnis | null, FormData>(async (_zustand, formData) => beitrittEinreichen(slug, formData), null);

  if (ergebnis?.ok) {
    return (
      <div role="status" className="flex flex-col gap-2 text-sm">
        <p className="font-medium">Danke, dein Antrag ist eingegangen.</p>
        <p className="text-muted-foreground">Du bekommst gleich eine Bestätigung per E-Mail. Der Verein prüft deinen Antrag und meldet sich bei dir.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vorname">Vorname</Label>
          <Input id="vorname" name="vorname" required maxLength={100} autoComplete="given-name" className="h-11 text-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nachname</Label>
          <Input id="name" name="name" required maxLength={100} autoComplete="family-name" className="h-11 text-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geburtsdatum">Geburtsdatum</Label>
          <Input id="geburtsdatum" name="geburtsdatum" type="date" required autoComplete="bday" className="h-11 text-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="geschlecht">Geschlecht (freiwillig)</Label>
          <select id="geschlecht" name="geschlecht" defaultValue="" className={SELECT_KLASSE}>
            <option value="">Keine Angabe</option>
            <option value="m">Männlich</option>
            <option value="w">Weiblich</option>
            <option value="divers">Divers</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className="h-11 text-base" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefon">Telefon (freiwillig)</Label>
          <Input id="telefon" name="telefon" type="tel" maxLength={50} autoComplete="tel" className="h-11 text-base" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Für Kinder und Jugendliche unter 18 Jahren füllt bitte ein Elternteil oder eine erziehungsberechtigte Person das Formular aus und gibt die eigene E-Mail-Adresse an.
      </p>

      {mannschaften.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mannschaftId">Gewünschte Mannschaft (freiwillig)</Label>
          <select id="mannschaftId" name="mannschaftId" defaultValue="" className={SELECT_KLASSE}>
            <option value="">Noch keine Angabe</option>
            {mannschaften.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Köderfeld gegen automatische Eintragungen: für Menschen unsichtbar und nicht erreichbar. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <Textarea id="website" name="website" tabIndex={-1} autoComplete="off" rows={1} />
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="datenschutz" required className="mt-1 size-5 shrink-0" />
          <span>
            Ich habe die{" "}
            <Link href="/datenschutz" target="_blank" className="font-medium underline">
              Datenschutzerklärung
            </Link>{" "}
            gelesen und bin einverstanden, dass meine Angaben für den Beitrittsantrag beim {vereinName} gespeichert werden.
          </span>
        </label>
        {satzungUrl && (
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" name="satzung" required className="mt-1 size-5 shrink-0" />
            <span>
              Ich habe die{" "}
              <a href={satzungUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                Satzung
              </a>{" "}
              des {vereinName} gelesen und stimme ihr zu.
            </span>
          </label>
        )}
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name="fotos" className="mt-1 size-5 shrink-0" />
          <span>Freiwillig: Der Verein darf Fotos und Videos von mir (bzw. meinem Kind) bei Spielen und Veranstaltungen veröffentlichen.</span>
        </label>
      </div>

      {ergebnis && !ergebnis.ok && (
        <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">
          {ergebnis.fehler}
        </p>
      )}
      <SubmitButton className="h-11 w-full sm:w-auto" pendingText="Wird gesendet…">
        Beitritt beantragen
      </SubmitButton>
      <p className="text-xs text-muted-foreground">Mit dem Antrag wirst du noch nicht Mitglied: der Verein prüft ihn und meldet sich bei dir.</p>
    </form>
  );
}
