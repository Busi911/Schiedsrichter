import { HilfeHinweis } from "@/components/hilfe-hinweis";
import Link from "next/link";
import { CheckCircle2Icon } from "lucide-react";
import { requireSession } from "@/lib/session";
import { holeDesignNeu } from "@/lib/design";
import { SubmitButton } from "@/components/submit-button";
import { ZurueckButton } from "@/components/zurueck-button";
import { cn } from "@/lib/utils";
import { designSetzen } from "./actions";

// Profil → Darstellung: freiwilliger Umschalter zwischen der klassischen Oberfläche und dem neuen App-Design (Dashboard mit Kacheln und großen Tasten).
// Standard: Demo und neue Vereine neu, Bestand klassisch (lib/design-regel.ts); wer wechselt, kann hier jederzeit zurück.
function Karte({
  wert,
  aktiv,
  titel,
  beta,
  text,
  vorschau,
}: {
  wert: "klassisch" | "neu";
  aktiv: boolean;
  titel: string;
  beta?: boolean;
  text: string;
  vorschau: React.ReactNode;
}) {
  return (
    <form action={designSetzen}>
      <input type="hidden" name="design" value={wert} />
      <SubmitButton
        variant="outline"
        aria-pressed={aktiv}
        className={cn(
          "h-auto w-full flex-col items-stretch gap-3 rounded-2xl p-4 text-left font-normal whitespace-normal",
          aktiv ? "border-2 border-primary bg-card" : "bg-card"
        )}
      >
        <span className="flex items-center gap-3">
          <span
            className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", aktiv ? "border-primary" : "border-muted-foreground/50")}
            aria-hidden
          >
            <span className={cn("size-3 rounded-full", aktiv ? "bg-primary" : "bg-transparent")} />
          </span>
          <span className="font-heading text-lg font-bold">{titel}</span>
          {beta && <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold tracking-wide text-amber-900 uppercase dark:bg-amber-950 dark:text-amber-200">Beta</span>}
        </span>
        <span aria-hidden className="block">
          {vorschau}
        </span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </SubmitButton>
    </form>
  );
}

export default async function DarstellungPage() {
  const session = await requireSession();
  const neu = await holeDesignNeu(session.user.vereinId!, session.user.id);
  const startHref = session.user.istAdmin || session.user.istAdminLesend ? "/admin" : "/profil";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 p-6 pb-24">
      <div>
        <ZurueckButton fallbackHref="/profil" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Mein Profil</p>
        <h1 className="font-heading text-2xl font-extrabold">Darstellung</h1>
        <HilfeHinweis anker="darstellung" />
      </div>
      <p className="text-muted-foreground">Wie soll HandballerPate für dich aussehen? Du kannst jederzeit wechseln.</p>

      <Karte
        wert="klassisch"
        aktiv={!neu}
        titel="Klassisch"
        text="Die bisherige Oberfläche mit Menü, Listen und Tabellen."
        vorschau={
          <span className="flex h-20 gap-2 rounded-xl bg-muted p-2.5">
            <span className="w-14 rounded-lg bg-foreground/10" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="h-3 w-3/5 rounded-md bg-foreground/20" />
              <span className="h-2.5 rounded bg-foreground/10" />
              <span className="h-2.5 rounded bg-foreground/10" />
              <span className="h-2.5 w-4/5 rounded bg-foreground/10" />
            </span>
          </span>
        }
      />
      <Karte
        wert="neu"
        aktiv={neu}
        titel="Neu"
        beta
        text="Wie eine App: ein Start-Bildschirm mit großen Kacheln und Tasten, die dich direkt zu dem bringen, was heute dran ist."
        vorschau={
          <span className="flex h-20 flex-col gap-1.5 rounded-xl bg-muted p-2.5">
            <span className="h-7 rounded-lg bg-primary" />
            <span className="grid flex-1 grid-cols-3 gap-1.5">
              <span className="rounded-md border bg-card" />
              <span className="rounded-md border bg-card" />
              <span className="rounded-md border bg-card" />
            </span>
          </span>
        }
      />

      <div
        role="status"
        className={cn("flex items-start gap-3 rounded-2xl p-4 text-sm", neu ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100" : "bg-muted")}
      >
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">{neu ? "Neues Design ist an" : "Klassisch ist an"}</p>
          <p>
            {neu ? (
              <>
                Dein Start-Bildschirm ist jetzt das neue Dashboard.{" "}
                <Link href={startHref} className="font-medium underline">
                  Zum Start
                </Link>
                . Zurückwechseln geht hier jederzeit.
              </>
            ) : (
              "Alles bleibt wie bisher. Tippe auf „Neu“, um das neue Design auszuprobieren. Wir freuen uns über Rückmeldung (Feedback-Taste oben)."
            )}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Die Einstellung gilt für dein Konto, auch auf deinem Handy und deinem Computer. Alle anderen im Verein behalten ihre eigene Wahl. Das neue Design ist
        in der Beta: Start-Bildschirm und Bereichsseiten sind neu, die übrigen Seiten sehen aus wie gewohnt.
      </p>
    </main>
  );
}
