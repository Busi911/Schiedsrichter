"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { pfad: "", label: "Übersicht" },
  { pfad: "/spielplan", label: "Spielplan" },
  { pfad: "/ergebnisse", label: "Ergebnisse" },
  { pfad: "/tabelle", label: "Tabelle" },
];

export function TeamTabs({ basis }: { basis: string }) {
  const pfad = usePathname();
  return (
    <nav aria-label="Mannschaftsbereiche" className="-mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-1 border-b">
        {TABS.map((t) => {
          const href = `${basis}${t.pfad}`;
          const aktiv = pfad === href;
          return (
            <li key={t.pfad}>
              <Link
                href={href}
                aria-current={aktiv ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition",
                  aktiv
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
