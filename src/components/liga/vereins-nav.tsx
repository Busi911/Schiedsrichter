"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3Icon, CalendarDaysIcon, CircleCheckIcon, DumbbellIcon, EllipsisIcon, NewspaperIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkSymbol } from "@/components/link-spinner";

const BEREICHE = [
  { pfad: "", label: "Ergebnisse", kurz: "Ergebnisse", Icon: CircleCheckIcon },
  { pfad: "/spiele", label: "Nächste Spiele", kurz: "Spiele", Icon: CalendarDaysIcon },
  { pfad: "/mannschaften", label: "Mannschaften", kurz: "Teams", Icon: UsersIcon },
  { pfad: "/statistik", label: "Statistik", kurz: "Statistik", Icon: BarChart3Icon },
  // Nur, wenn der Verein den Reiter eingeschaltet hat (Einstellungen → Training → öffentliche App, `mitTraining`).
  { pfad: "/training", label: "Training", kurz: "Training", Icon: DumbbellIcon },
  // Nur, wenn der Verein die Neuigkeiten eingeschaltet hat (Einstellungen → Neuigkeiten, `mitNeuigkeiten`).
  { pfad: "/neuigkeiten", label: "Neuigkeiten", kurz: "News", Icon: NewspaperIcon },
] as const;

// Auf dem Handy passen höchstens FÜNF Plätze in die Leiste. Sind es mehr Bereiche (Training UND Neuigkeiten), bleiben die vier
// festen und ein Platz "Mehr" führt auf eine Übersicht mit den übrigen (`/mehr`); am Desktop stehen weiterhin alle als Tabs.
const MEHR = { pfad: "/mehr", label: "Mehr", kurz: "Mehr", Icon: EllipsisIcon } as const;
const MAX_MOBIL = 5;

// Die vier (mit Training oder Neuigkeiten fünf, mit beiden vier plus „Mehr“) Bereiche der Vereinsseite: auf dem Handy als feste Bottom-Bar,
// ab md als Tabs unter dem Kopf. Nur auf den vier Bereichsseiten sichtbar —
// auf Mannschaftsseiten bleibt die Leiste mit "Teams" aktiv (neben den eigenen Tabs Übersicht, Spielplan, …), damit
// man auch dort (und in der installierten App ohne Browser-Zurück) mit einem Tipp in jeden Bereich kommt.
export function VereinsNav({ basis, mitTraining = false, mitNeuigkeiten = false }: { basis: string; mitTraining?: boolean; mitNeuigkeiten?: boolean }) {
  const pfad = usePathname();
  // Ohne eingeschaltete Zusatzbereiche bleibt es bei vier (wie bisher); jeder eingeschaltete kommt dazu.
  const bereiche = BEREICHE.filter((b) => (b.pfad === "/training" ? mitTraining : b.pfad === "/neuigkeiten" ? mitNeuigkeiten : true));
  // Handy: bis fünf alle, darüber vier feste + "Mehr" (die übrigen stehen auf der Seite /mehr).
  const mobilBereiche = bereiche.length > MAX_MOBIL ? [...bereiche.slice(0, MAX_MOBIL - 1), MEHR] : bereiche;
  const versteckt = bereiche.length > MAX_MOBIL ? bereiche.slice(MAX_MOBIL - 1) : [];
  const fuenf = mobilBereiche.length > 4;
  const aktuell =
    bereiche.find((b) => pfad === `${basis}${b.pfad}`) ??
    (pfad === `${basis}${MEHR.pfad}` ? MEHR : undefined) ??
    (pfad.startsWith(`${basis}/`) ? bereiche.find((b) => b.pfad === "/mannschaften") : undefined);
  if (!aktuell) return null;
  // Auf dem Handy ist ein versteckter Bereich (oder die Mehr-Seite selbst) über "Mehr" aktiv.
  const aktuellMobil = versteckt.some((b) => b === aktuell) || aktuell === MEHR ? MEHR : aktuell;

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
          {mobilBereiche.map((b) => {
            const aktiv = b === aktuellMobil;
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
