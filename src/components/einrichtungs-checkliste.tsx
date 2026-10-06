import { SCHRITT_SYMBOL, type EinrichtungsSchritt } from "@/lib/nuliga/einrichtung-status";

// Checkliste der automatischen nuLiga-Einrichtung: ✓ automatisch geklappt, ! bitte prüfen, ✕ fehlgeschlagen.
export function leseEinrichtungsErgebnis(roh: string | undefined): { verein: string; vereinId?: string; schritte: EinrichtungsSchritt[] } | null {
  if (!roh) return null;
  try {
    const d = JSON.parse(roh);
    return Array.isArray(d?.schritte) && typeof d.verein === "string" ? d : null;
  } catch {
    return null;
  }
}

export function EinrichtungsChecklisteListe({ schritte }: { schritte: EinrichtungsSchritt[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
        {schritte.map((x) => (
          <li key={x.schluessel} className="flex items-start gap-2">
            <span
              className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                x.status === "ok" ? "bg-emerald-700" : x.status === "pruefen" ? "bg-slate-500" : "bg-red-700"
              }`}
              aria-label={x.status === "ok" ? "automatisch geklappt" : x.status === "pruefen" ? "bitte prüfen" : "fehlgeschlagen"}
            >
              {SCHRITT_SYMBOL[x.status]}
            </span>
            <span>
              <span className="font-medium">{x.label}</span>
              <span className="text-muted-foreground"> — {x.detail}</span>
            </span>
          </li>
        ))}
    </ul>
  );
}
