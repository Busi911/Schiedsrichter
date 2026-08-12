"use client";

import { useState } from "react";
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

// Häufig gebrauchte Punkte bleiben direkt sichtbar, seltener genutzte
// (Stammdaten-Pflege, Auswertungen) wandern unter das "Verwaltung"-Dropdown
// — sonst wächst die Leiste mit jedem neuen Admin-Bereich flach weiter und
// bricht auf Desktop-Breite in mehrere Zeilen um.
const PRIMARY_ITEMS = [
  { href: "/admin", label: "Übersicht", exact: true },
  { href: "/admin/kalender", label: "Kalender" },
  { href: "/admin/rundenspiele", label: "Hallenspielplan" },
  { href: "/admin/zuordnung", label: "Zuordnung" },
];

const VERWALTUNG_ITEMS = [
  { href: "/admin/mannschaften", label: "Mannschaften" },
  { href: "/admin/funktionstraeger", label: "Funktionsträger" },
  { href: "/admin/termine", label: "Termine" },
  { href: "/admin/auswertung", label: "Auswertung" },
  { href: "/admin/zuschuesse", label: "Zuschüsse" },
  { href: "/admin/einstellungen", label: "Einstellungen" },
];

const ALLE_ITEMS = [...PRIMARY_ITEMS, ...VERWALTUNG_ITEMS];

function istAktiv(
  pathname: string | null,
  item: { href: string; exact?: boolean }
) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname?.startsWith(item.href + "/");
}

export function AdminNav() {
  const pathname = usePathname();
  const [offen, setOffen] = useState(false);
  const verwaltungAktiv = VERWALTUNG_ITEMS.some((item) => istAktiv(pathname, item));

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        aria-label={offen ? "Menü schließen" : "Menü öffnen"}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "md:hidden")}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          {offen ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/* Mobile: alle Punkte flach in einer Liste hinter dem Hamburger-Menü
          — dort stört die Länge nicht, da sie ohnehin eingeklappt ist. */}
      <nav
        className={cn(
          "w-full flex-col gap-1 md:hidden",
          offen ? "flex" : "hidden"
        )}
      >
        {ALLE_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOffen(false)}
            className={cn(
              buttonVariants({
                variant: istAktiv(pathname, item) ? "secondary" : "ghost",
                size: "sm",
              }),
              "justify-start"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Desktop: häufige Punkte direkt, seltenere unter "Verwaltung". */}
      <nav className="hidden md:flex md:flex-row md:flex-wrap md:items-center md:gap-1">
        {PRIMARY_ITEMS.map((item) => (
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

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({
                variant: verwaltungAktiv ? "secondary" : "ghost",
                size: "sm",
              }),
              "gap-1"
            )}
          >
            Verwaltung
            <ChevronDownIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {VERWALTUNG_ITEMS.map((item) => (
              <DropdownMenuLinkItem
                key={item.href}
                render={<Link href={item.href} />}
                className={cn(istAktiv(pathname, item) && "bg-accent/60 font-medium")}
              >
                {item.label}
              </DropdownMenuLinkItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </>
  );
}
