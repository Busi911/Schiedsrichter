import { FavoritStern } from "@/components/liga/favorit-stern";

// Titelzeile eines Vereinsbereichs (Ergebnisse, Nächste Spiele, Mannschaften)
// mit Favoriten-Stern für den Verein.
export function BereichsKopf({ titel, vereinId, vereinName }: { titel: string; vereinId: string; vereinName: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-heading text-lg font-semibold">{titel}</h1>
      <FavoritStern typ="verein" id={vereinId} label={vereinName} className="shrink-0" />
    </div>
  );
}
