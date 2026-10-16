"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3Icon, CalendarDaysIcon, CircleCheckIcon, DumbbellIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkSymbol } from "@/components/link-spinner";

const BEREICHE = [
  { pfad: "", label: "Ergebnisse", kurz: "Ergebnisse", Icon: CircleCheckIcon },
  { pfad: "/spiele", label: "Nächste Spiele", kurz: "Spiele", Icon: CalendarDaysIcon },
  { pfad: "/mannschaften", label: "Mannschaften", kurz: "Teams", Icon: UsersIcon },
  { pfad: "/statistik", label: "Statistik", kurz: "Statistik", Icon: BarChart3Icon },
  // Nur, wenn der Verein den Reiter eingeschaltet hat (Einstellungen → Training → öffentliche App, `mitTraining`).
  { pfad: "/training", label: "Training", kurz: "Training", Icon: DumbbellIcon },
] as const;

// Die vier (mit Training fünf) Bereiche der Vereinsseite: auf dem Handy als feste Bottom-Bar,
// ab md als Tabs unter dem Kopf. Nur auf den vier Bereichsseiten sichtbar —
// auf Mannschaftsseiten bleibt die Leiste mit "Teams" aktiv (neben den eigenen Tabs Übersicht, Spielplan, …), damit
// man auch dort (und in der installierten App ohne Browser-Zurück) mit einem Tipp in jeden Bereich kommt.
export function VereinsNav({ basis, mitTraining = false }: { basis: string; mitTraining?: boolean }) {
  const pfad = usePathname();
  // Ohne eingeschaltetes Training bleibt es bei vier Bereichen (wie bisher), sonst fünf.
  const bereiche = BEREICHE.filter((b) => mitTraining || b.pfad !== "/training");
  const fuenf = bereiche.length > 4;
  const aktuell =
    bereiche.find((b) => pfad === `${basis}${b.pfad}`) ??
    (pfad.startsWith(`${basis}/`) ? bereiche.find((b) => b.pfad === "/mannschaften") : undefined);
  if (!aktuell) return null;

  return (
    <>
      <nav aria-label="Bereiche des Vereins" className="mx-auto hidden w-full max-w-3xl px-4 pt-3 md:block">
        <ul className="flex gap-1 border-b">
          {bereiche.map((b) => (
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
        <ul className={cn("mx-auto grid max-w-3xl gap-1 px-2 pt-2 pb-2", fuenf ? "grid-cols-5" : "grid-cols-4")}>
          {bereiche.map((b) => {
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
                      "flex h-9 items-center justify-center rounded-full transition",
                      fuenf ? "w-12" : "w-14",
                      aktiv && "bg-primary text-primary-foreground shadow-sm"
                    )}
                  >
                    <LinkSymbol className={fuenf ? "size-6" : "size-7"}>
                      <b.Icon className={fuenf ? "size-6" : "size-7"} />
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
