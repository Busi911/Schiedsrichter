"use client";

import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { favoritUmschalten, useFavoriten } from "@/lib/liga-favoriten-lokal";

// Favorit auf diesem Gerät (localStorage) — ohne Konto, ohne Login.
export function FavoritStern({
  typ,
  id,
  label,
  className,
}: {
  typ: "verein" | "mannschaft";
  id: string;
  label: string;
  className?: string;
}) {
  const f = useFavoriten();
  const aktiv = (typ === "verein" ? f.vereine : f.mannschaften).includes(id);
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground",
        aktiv && "text-amber-500 hover:text-amber-500",
        className
      )}
      aria-pressed={aktiv}
      aria-label={aktiv ? `${label} aus Favoriten entfernen` : `${label} favorisieren`}
      title={aktiv ? "Aus Favoriten entfernen" : "Favorisieren (nur auf diesem Gerät)"}
      onClick={() => favoritUmschalten(typ, id)}
    >
      <StarIcon className={cn("size-5", aktiv && "fill-current")} />
    </button>
  );
}
