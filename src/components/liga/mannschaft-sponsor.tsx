import type { MannschaftSponsorAnsicht } from "@/lib/mannschaft-sponsor";

// Kleine Sponsorenzeile unter dem Kopf einer Mannschaftsseite: "Unterstützt von …" mit dem Bild des Sponsors.
// Kein Vollbild, kein Tracking; Links nur https (beim Speichern geprüft), in neuem Tab, als Werbelink markiert.
export function MannschaftSponsorZeile({ basis, sponsor }: { basis: string; sponsor: MannschaftSponsorAnsicht }) {
  const bild = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${basis}/sponsor?v=${sponsor.version}`}
      alt={sponsor.name ?? "Sponsor"}
      className="max-h-12 w-auto max-w-[min(14rem,60vw)] object-contain"
      loading="lazy"
    />
  );
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-lg border bg-card px-3 py-2" aria-label="Sponsor der Mannschaft">
      <span className="shrink-0 text-xs text-muted-foreground">Unterstützt von</span>
      {sponsor.link ? (
        <a href={sponsor.link} target="_blank" rel="sponsored noopener noreferrer" className="inline-flex min-h-11 items-center">
          {bild}
        </a>
      ) : (
        bild
      )}
    </div>
  );
}
