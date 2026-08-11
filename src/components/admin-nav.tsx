"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/admin", label: "Übersicht", exact: true },
  { href: "/admin/kalender", label: "Kalender" },
  { href: "/admin/mannschaften", label: "Mannschaften" },
  { href: "/admin/funktionstraeger", label: "Funktionsträger" },
  { href: "/admin/termine", label: "Termine" },
  { href: "/admin/zuordnung", label: "Zuordnung" },
  { href: "/admin/auswertung", label: "Auswertung" },
  { href: "/admin/zuschuesse", label: "Zuschüsse" },
  { href: "/admin/einstellungen", label: "Einstellungen" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname?.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({
                variant: active ? "secondary" : "ghost",
                size: "sm",
              })
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
