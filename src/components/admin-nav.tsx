"use client";

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

// Nur Desktop (ab md) — mobil übernimmt die Bottom-Bar aus
// admin-bottom-nav.tsx, deren Punkte mit den Listen hier übereinstimmen
// müssen.
//
// Häufig gebrauchte Punkte bleiben direkt sichtbar, seltener genutzte
// (Stammdaten-Pflege, Auswertungen) wandern unter das "Verwaltung"-Dropdown
// — sonst wächst die Leiste mit jedem neuen Admin-Bereich flach weiter und
// bricht auf Desktop-Breite in mehrere Zeilen um.
const PRIMARY_ITEMS = [
  { href: "/admin", label: "Übersicht", exact: true },
  { href: "/admin/kalender", label: "Kalender" },
  { href: "/admin/termine", label: "Termine" },
  { href: "/admin/trainingsplan", label: "Trainingsplan" },
];

const VERWALTUNG_ITEMS = [
  { href: "/admin/mannschaften", label: "Mannschaften" },
  { href: "/admin/funktionstraeger", label: "Funktionsträger" },
  { href: "/admin/dienste", label: "Offene Dienste" },
  { href: "/admin/auswertung", label: "Auswertung & Export" },
  { href: "/admin/einstellungen", label: "Einstellungen" },
];

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
  const verwaltungAktiv = VERWALTUNG_ITEMS.some((item) => istAktiv(pathname, item));

  return (
    <>
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
