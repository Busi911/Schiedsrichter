import { ChevronRightIcon } from "lucide-react";
import type { MonatsGruppe } from "@/lib/monats-gruppierung";

// Gemeinsame Darstellung für alle drei Wart-Seiten (Schiedsrichterwart/
// Zeitnehmerwart/Ordnerwart) — jede Seite gruppiert ihre eigene, bereits
// aufbereitete Termin-Liste über gruppiereNachMonat (siehe dort) und
// reicht hier nur noch das fertige renderItem für ihre eigene Karten-
// Darstellung durch. Reines Server-Component-Rendering (natives <details>
// als Aufklapp-Mechanik), kein Client-JS nötig.
export function MonatsgruppenListe<T>({
  gruppen,
  renderItem,
  leerTextOhneFilter,
}: {
  gruppen: MonatsGruppe<T>[];
  renderItem: (item: T) => React.ReactNode;
  leerTextOhneFilter: string;
}) {
  if (gruppen.length === 0) {
    return <p className="text-sm text-muted-foreground">{leerTextOhneFilter}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {gruppen.map((gruppe) => (
        <details
          key={gruppe.schluessel}
          open={gruppe.standardOffen}
          className="group rounded-lg border"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
              {gruppe.label}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {gruppe.offenAnzahl > 0
                ? `${gruppe.offenAnzahl} offen · ${gruppe.items.length} Termine`
                : `${gruppe.items.length} Termine`}
            </span>
          </summary>
          <div className="flex flex-col gap-3 border-t p-3">
            {gruppe.items.map(renderItem)}
          </div>
        </details>
      ))}
    </div>
  );
}
