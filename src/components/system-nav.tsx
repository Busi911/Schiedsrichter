"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/system", label: "Übersicht", exact: true },
  { href: "/system/vereine", label: "Vereine" },
  { href: "/system/gesundheit", label: "Gesundheit" },
  { href: "/system/abrechnung", label: "Abrechnung" },
  { href: "/system/warteliste", label: "Warteliste" },
  { href: "/system/feedback", label: "Feedback" },
  { href: "/system/abgleich", label: "Abgleich" },
  { href: "/system/sync", label: "Liga-Sync" },
  { href: "/system/ndr", label: "Bundesliga" },
  { href: "/system/mail", label: "Mail-Test" },
  { href: "/system/sponsor", label: "Sponsor" },
];

export function SystemNav() {
  const pathname = usePathname();

  return (
    // Auf Mobile wraps diese Nav (kein Hamburger-Menü wie im Admin-Bereich,
    // siehe admin-nav.tsx) als eigene Zeile unter das Logo — links gepackt
    // wirkte das mit viel Leerraum rechts unbalanciert.
    <nav className="flex flex-wrap justify-center gap-1 md:justify-start">
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
