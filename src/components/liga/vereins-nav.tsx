"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon, CircleCheckIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const BEREICHE = [
  { pfad: "", label: "Ergebnisse", kurz: "Ergebnisse", Icon: CircleCheckIcon },
  { pfad: "/spiele", label: "Nächste Spiele", kurz: "Spiele", Icon: CalendarDaysIcon },
  { pfad: "/mannschaften", label: "Mannschaften", kurz: "Teams", Icon: UsersIcon },
] as const;

// Die drei Bereiche der Vereinsseite: auf dem Handy als feste Bottom-Bar,
// ab md als Tabs unter dem Kopf. Nur auf den drei Bereichsseiten sichtbar —
// auf Mannschaftsseiten gelten deren eigene Tabs (Übersicht, Spielplan, …).
export function VereinsNav({ basis }: { basis: string }) {
  const pfad = usePathname();
  const aktuell = BEREICHE.find((b) => pfad === `${basis}${b.pfad}`);
  if (!aktuell) return null;

  return (
    <>
      <nav aria-label="Bereiche des Vereins" className="mx-auto hidden w-full max-w-3xl px-4 pt-3 md:block">
        <ul className="flex gap-1 border-b">
          {BEREICHE.map((b) => (
            <li key={b.pfad}>
              <Link
                href={`${basis}${b.pfad}`}
                aria-current={b === aktuell ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition",
                  b === aktuell
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <b.Icon className="size-4" />
                {b.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav
        aria-label="Bereiche des Vereins"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-3 gap-1 px-2 pt-1.5 pb-1.5">
          {BEREICHE.map((b) => {
            const aktiv = b === aktuell;
            return (
              <li key={b.pfad}>
                <Link
                  href={`${basis}${b.pfad}`}
                  aria-current={aktiv ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-semibold transition",
                    aktiv ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-14 items-center justify-center rounded-full transition",
                      aktiv && "bg-accent"
                    )}
                  >
                    <b.Icon className="size-6" />
                  </span>
                  {b.kurz}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
