"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/system", label: "Übersicht", exact: true },
  { href: "/system/vereine", label: "Vereine" },
  { href: "/system/warteliste", label: "Warteliste" },
  { href: "/system/feedback", label: "Feedback" },
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
