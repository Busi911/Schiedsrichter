"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { StarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { favoritUmschalten } from "@/app/verein/actions";

// aktiv = null: Besucher ist nicht eingeloggt -> Stern führt zum Login.
export function FavoritStern({
  typ,
  id,
  aktiv,
  label,
  className,
}: {
  typ: "verein" | "mannschaft";
  id: string;
  aktiv: boolean | null;
  label: string;
  className?: string;
}) {
  const [, starte] = useTransition();
  const [optimistisch, setzeOptimistisch] = useOptimistic(aktiv ?? false);
  const basis = cn(
    "inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground",
    className
  );

  if (aktiv === null) {
    return (
      <Link href="/login" className={basis} title="Zum Favorisieren einloggen" aria-label={`${label} favorisieren (Login nötig)`}>
        <StarIcon className="size-5" />
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={cn(basis, optimistisch && "text-amber-500 hover:text-amber-500")}
      aria-pressed={optimistisch}
      aria-label={optimistisch ? `${label} aus Favoriten entfernen` : `${label} favorisieren`}
      title={optimistisch ? "Aus Favoriten entfernen" : "Favorisieren"}
      onClick={() =>
        starte(async () => {
          setzeOptimistisch(!optimistisch);
          try {
            await favoritUmschalten(typ, id);
          } catch {
            // Rollback passiert automatisch (useOptimistic fällt nach der
            // Transition auf den Server-Wert zurück).
          }
        })
      }
    >
      <StarIcon className={cn("size-5", optimistisch && "fill-current")} />
    </button>
  );
}
