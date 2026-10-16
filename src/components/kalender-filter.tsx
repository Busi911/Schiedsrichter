import Link from "next/link";
import { cn } from "@/lib/utils";
import { KALENDER_ARTEN, kalenderArtenZusatz, schalteKalenderArt, type KalenderArt } from "@/lib/kalender-arten";

// Filter über dem Kalender: zeigt, welche Arten von Einträgen (Spiele & Dienste, Training, Vereinstermine) sichtbar sind, und schaltet sie per Link ein/aus
// (Suchparameter `zeige`, bleibt beim Monatswechsel erhalten). Ohne Auswahl sind alle sichtbar. Es erscheinen nur Arten, die es für die Person gibt.
export function KalenderFilter({
  basisPfad,
  monat,
  arten,
  verfuegbar,
}: {
  basisPfad: string;
  monat: string;
  arten: Set<KalenderArt>;
  verfuegbar: { training: boolean; verein: boolean };
}) {
  const angebot = (Object.keys(KALENDER_ARTEN) as KalenderArt[]).filter((a) => a === "spiele" || verfuegbar[a]);
  if (angebot.length < 2) return null;
  return (
    <nav aria-label="Anzeigen im Kalender" className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Anzeigen:</span>
      {angebot.map((art) => {
        const an = arten.has(art);
        const nachKlick = schalteKalenderArt(arten, art);
        return (
          <Link
            key={art}
            href={`${basisPfad}?monat=${monat}${kalenderArtenZusatz(nachKlick)}`}
            aria-pressed={an}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-medium transition-colors md:min-h-9",
              an ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {KALENDER_ARTEN[art]}
          </Link>
        );
      })}
    </nav>
  );
}
