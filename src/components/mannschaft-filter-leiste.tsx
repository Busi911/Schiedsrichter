import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LinkSpinner } from "@/components/link-spinner";

// Gemeinsam für alle drei Wart-Seiten — filtert die Termine-Liste
// zusätzlich zu "Nur offene anzeigen" nach Mannschaft. Nur relevant für
// Vereine mit mehr als einer Mannschaft (siehe anzeigbareMannschaften in
// den jeweiligen page.tsx: nur Mannschaften mit mindestens einem
// relevanten Termin, sonst führte ein Klick nur zu "keine Termine").
export function MannschaftFilterLeiste({
  mannschaften,
  aktuelleMannschaftId,
  hrefFuer,
}: {
  mannschaften: { id: string; name: string; altersklasse: string | null }[];
  aktuelleMannschaftId: string | null;
  hrefFuer: (mannschaftId: string | null) => string;
}) {
  if (mannschaften.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant={!aktuelleMannschaftId ? "default" : "outline"}
        size="sm"
        render={<Link href={hrefFuer(null)} />}
        nativeButton={false}
      >
        Alle Mannschaften
        <LinkSpinner />
      </Button>
      {mannschaften.map((m) => (
        <Button
          key={m.id}
          variant={aktuelleMannschaftId === m.id ? "default" : "outline"}
          size="sm"
          render={<Link href={hrefFuer(m.id)} />}
          nativeButton={false}
        >
          {m.altersklasse ? `${m.name} (${m.altersklasse})` : m.name}
          <LinkSpinner />
        </Button>
      ))}
    </div>
  );
}
