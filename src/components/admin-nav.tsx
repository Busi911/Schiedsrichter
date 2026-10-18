"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminNavEintrag, AdminNavigation } from "@/lib/admin-navigation";

// Nur Desktop (ab md) — mobil übernimmt die Bottom-Bar aus bottom-nav.tsx. Beide werden aus lib/admin-navigation.ts gespeist (EINE Quelle):
// Übersicht und Kalender stehen direkt, alles andere thematisch gruppiert in Dropdowns (Spielbetrieb, Dienste, Verein, Auswertung).
function istAktiv(pathname: string | null, item: Pick<AdminNavEintrag, "href" | "exact">) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname?.startsWith(item.href + "/");
}

export function AdminNav({ nav }: { nav: AdminNavigation }) {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex md:flex-row md:flex-wrap md:items-center md:gap-1" aria-label="Hauptnavigation">
      {nav.direkt.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={buttonVariants({
            variant: istAktiv(pathname, item) ? "secondary" : "ghost",
            size: "sm",
          })}
        >
          {item.label}
        </Link>
      ))}

      {nav.gruppen.map((gruppe) => (
        <DropdownMenu key={gruppe.id}>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({
                variant: gruppe.eintraege.some((e) => istAktiv(pathname, e)) ? "secondary" : "ghost",
                size: "sm",
              }),
              "gap-1"
            )}
          >
            {gruppe.titel}
            <ChevronDownIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {gruppe.eintraege.map((item, index) => (
              <Fragment key={item.href}>
                {item.abschnitt && item.abschnitt !== gruppe.eintraege[index - 1]?.abschnitt && (
                  <p className={cn("px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase", index > 0 && "mt-1 border-t pt-2")}>
                    {item.abschnitt}
                  </p>
                )}
                <DropdownMenuLinkItem
                  render={<Link href={item.href} />}
                  className={cn(istAktiv(pathname, item) && "bg-accent/60 font-medium")}
                >
                  {item.label}
                </DropdownMenuLinkItem>
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );
}
