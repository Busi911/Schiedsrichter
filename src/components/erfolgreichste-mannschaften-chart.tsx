import type { MannschaftsBilanz } from "@/lib/dienste-statistik";

// Gestapelter Balken pro Mannschaft (Sieg/Unentschieden/Niederlage) — die
// Balkenlänge selbst zeigt zusätzlich die Anzahl Spiele relativ zur
// spielstärksten Mannschaft, damit z.B. eine Jugendmannschaft mit nur 2
// Spielen nicht optisch gleich groß wirkt wie eine mit 20. Bewusst eigene,
// kleine Komponente statt einer generischen Chart-Bibliothek — das Projekt
// hat sonst keine Diagramme und die App ist bislang bewusst grau/weiß
// gehalten (siehe globals.css), daher hier dieselben Töne (Vordergrund/
// gedämpftes Grau) plus die einzige im Projekt reservierte "negative" Farbe
// (destructive-Rot) statt einer neuen, unpassenden Farbpalette.
export function ErfolgreichsteMannschaftenChart({
  bilanzen,
}: {
  bilanzen: MannschaftsBilanz[];
}) {
  const maxSpiele = Math.max(...bilanzen.map((b) => b.spiele), 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-foreground" aria-hidden />
          Sieg
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/40" aria-hidden />
          Unentschieden
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive" aria-hidden />
          Niederlage
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {bilanzen.map((b) => (
          <div key={b.mannschaftId} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{b.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {b.siege}S {b.unentschieden}U {b.niederlagen}N
              </span>
            </div>
            <div
              className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted"
              style={{ width: `${Math.max((b.spiele / maxSpiele) * 100, 8)}%` }}
            >
              {b.siege > 0 && (
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${(b.siege / b.spiele) * 100}%` }}
                />
              )}
              {b.unentschieden > 0 && (
                <div
                  className="h-full bg-muted-foreground/40"
                  style={{ width: `${(b.unentschieden / b.spiele) * 100}%` }}
                />
              )}
              {b.niederlagen > 0 && (
                <div
                  className="h-full bg-destructive"
                  style={{ width: `${(b.niederlagen / b.spiele) * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
