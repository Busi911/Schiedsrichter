import { FavoritStern } from "@/components/liga/favorit-stern";
import { Brotkrumen } from "@/components/liga/brotkrumen";

// Titelzeile eines Vereinsbereichs (Ergebnisse, Nächste Spiele, Mannschaften, Statistik) mit Brotkrumen und Favoriten-Stern
// für den Verein. Die Überschrift nennt den Vereinsnamen (für Screenreader/Suchmaschinen; sichtbar steht er schon im Kopfband).
// `pfad` = Bereich unter /verein/<slug> ("" = Startseite des Vereins).
export function BereichsKopf({
  titel,
  vereinId,
  vereinName,
  slug,
  pfad,
}: {
  titel: string;
  vereinId: string;
  vereinName: string;
  slug: string;
  pfad: string;
}) {
  const basis = `/verein/${slug}`;
  return (
    <div className="space-y-1">
      <Brotkrumen
        kette={[
          { name: "Vereine", href: "/verein" },
          { name: vereinName, href: basis },
          ...(pfad ? [{ name: titel, href: `${basis}${pfad}` }] : []),
        ]}
      />
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">
          <span className="sr-only">{vereinName}: </span>
          {titel}
        </h1>
        <FavoritStern typ="verein" id={vereinId} label={vereinName} className="shrink-0" />
      </div>
    </div>
  );
}
