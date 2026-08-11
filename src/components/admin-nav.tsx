"use client";

import { useState } from "react";
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
  { href: "/admin/rundenspiele", label: "Rundenspiele" },
  { href: "/admin/zuordnung", label: "Zuordnung" },
  { href: "/admin/auswertung", label: "Auswertung" },
  { href: "/admin/zuschuesse", label: "Zuschüsse" },
  { href: "/admin/einstellungen", label: "Einstellungen" },
];

export function AdminNav() {
  const pathname = usePathname();
  const [offen, setOffen] = useState(false);

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
      <nav
        className={cn(
          "w-full flex-col gap-1 md:order-none md:w-auto md:flex md:flex-row md:flex-wrap",
          offen ? "flex" : "hidden"
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOffen(false)}
              className={cn(
                buttonVariants({
                  variant: active ? "secondary" : "ghost",
                  size: "sm",
                }),
                "justify-start md:justify-center"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
