import type { DienstEinsatzZahl } from "@/lib/dienste-statistik";

// Einfacher horizontaler Balken pro Person, eine einzige Farbe (Magnitude,
// kein Kategorie-Vergleich) — siehe Kommentar in
// ErfolgreichsteMannschaftenChart zur Farbwahl.
export function TopDienstmenschenChart({
  personen,
}: {
  personen: DienstEinsatzZahl[];
}) {
  const max = Math.max(...personen.map((p) => p.anzahlEinsaetze), 1);

  return (
    <div className="flex flex-col gap-2.5">
      {personen.map((p) => (
        <div key={p.userId} className="flex items-center gap-3 text-sm">
          <span
            className="w-32 shrink-0 truncate font-medium"
            title={p.name ?? p.email}
          >
            {p.name ?? p.email}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="h-2.5 rounded-full bg-foreground"
              style={{ width: `${Math.max((p.anzahlEinsaetze / max) * 100, 4)}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">
            {p.anzahlEinsaetze}
          </span>
        </div>
      ))}
    </div>
  );
}
