"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3Icon, CalendarDaysIcon, CircleCheckIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkSymbol } from "@/components/link-spinner";

const BEREICHE = [
  { pfad: "", label: "Ergebnisse", kurz: "Ergebnisse", Icon: CircleCheckIcon },
  { pfad: "/spiele", label: "Nächste Spiele", kurz: "Spiele", Icon: CalendarDaysIcon },
  { pfad: "/mannschaften", label: "Mannschaften", kurz: "Teams", Icon: UsersIcon },
  { pfad: "/statistik", label: "Statistik", kurz: "Statistik", Icon: BarChart3Icon },
] as const;

// Die vier Bereiche der Vereinsseite: auf dem Handy als feste Bottom-Bar,
// ab md als Tabs unter dem Kopf. Nur auf den vier Bereichsseiten sichtbar —
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
                <LinkSymbol className="size-4">
                  <b.Icon className="size-4" />
                </LinkSymbol>
                {b.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav
        aria-label="Bereiche des Vereins"
        data-vereins-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/15 bg-card dark:border-foreground/25 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:hidden"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-4 gap-1 px-2 pt-2 pb-2">
          {BEREICHE.map((b) => {
            const aktiv = b === aktuell;
            return (
              <li key={b.pfad}>
                <Link
                  href={`${basis}${b.pfad}`}
                  aria-current={aktiv ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl py-1 text-xs font-bold transition active:scale-95",
                    aktiv ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-14 items-center justify-center rounded-full transition",
                      aktiv && "bg-primary text-primary-foreground shadow-sm"
                    )}
                  >
                    <LinkSymbol className="size-7">
                      <b.Icon className="size-7" />
                    </LinkSymbol>
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
