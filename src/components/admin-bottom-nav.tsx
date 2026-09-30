"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDaysIcon,
  CircleHelpIcon,
  ClipboardListIcon,
  DumbbellIcon,
  HomeIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  UsersRoundIcon,
  BarChart3Icon,
  HandHelpingIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";

// Mobile-Navigation wie in einer nativen App (nur unter md — auf Desktop
// bleibt die Kopfzeilen-Nav aus admin-nav.tsx). Die vier häufigsten Bereiche
// direkt erreichbar, alles Übrige im "Mehr"-Sheet. Die Punkte hier müssen mit
// PRIMARY_ITEMS/VERWALTUNG_ITEMS in admin-nav.tsx übereinstimmen.
const TABS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: "/admin", label: "Übersicht", icon: HomeIcon, exact: true },
  { href: "/admin/kalender", label: "Kalender", icon: CalendarDaysIcon },
  { href: "/admin/termine", label: "Termine", icon: ClipboardListIcon },
  { href: "/admin/trainingsplan", label: "Training", icon: DumbbellIcon },
];

const MEHR_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/dienste", label: "Offene Dienste", icon: HandHelpingIcon },
  { href: "/admin/mannschaften", label: "Mannschaften", icon: UsersRoundIcon },
  { href: "/admin/funktionstraeger", label: "Funktionsträger", icon: UsersIcon },
  { href: "/admin/auswertung", label: "Auswertung & Export", icon: BarChart3Icon },
  { href: "/admin/einstellungen", label: "Einstellungen", icon: SettingsIcon },
  { href: "/profil", label: "Mein Profil", icon: UserIcon },
  { href: "/hilfe", label: "Hilfe", icon: CircleHelpIcon },
];

function istAktiv(pathname: string | null, href: string, exact?: boolean) {
  return exact
    ? pathname === href
    : pathname === href || !!pathname?.startsWith(href + "/");
}

export function AdminBottomNav({
  offeneDiensteAnzahl,
  logoutAction,
}: {
  offeneDiensteAnzahl: number;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [offen, setOffen] = useState(false);
  const mehrAktiv = MEHR_ITEMS.some(
    (i) => i.href !== "/profil" && i.href !== "/hilfe" && istAktiv(pathname, i.href)
  );

  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOffen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offen]);

  return (
    <div className="md:hidden">
      {offen && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setOffen(false)}
          aria-hidden
        />
      )}
      {offen && (
        <div
          role="dialog"
          aria-label="Weitere Bereiche"
          className="fixed inset-x-0 bottom-16 z-50 mx-3 flex flex-col gap-1 rounded-xl border bg-background p-2 shadow-xl"
        >
          {MEHR_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOffen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                istAktiv(pathname, item.href) ? "bg-secondary font-medium" : "hover:bg-muted"
              )}
            >
              <item.icon className="size-4 text-muted-foreground" />
              <span className="flex-1">{item.label}</span>
              {item.href === "/admin/dienste" && offeneDiensteAnzahl > 0 && (
                <Badge variant="warning">{offeneDiensteAnzahl}</Badge>
              )}
            </Link>
          ))}
          <form action={logoutAction}>
            <SubmitButton
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-sm font-normal"
            >
              <LogOutIcon className="size-4 text-muted-foreground" />
              Logout
            </SubmitButton>
          </form>
        </div>
      )}

      <nav
        aria-label="Hauptnavigation"
        data-bottom-nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex h-16 max-w-md items-stretch">
          {TABS.map((tab) => {
            const aktiv = istAktiv(pathname, tab.href, tab.exact);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  onClick={() => setOffen(false)}
                  aria-current={aktiv ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-0.5 text-[11px]",
                    aktiv ? "font-medium text-primary" : "text-muted-foreground"
                  )}
                >
                  <tab.icon className="size-5" />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOffen((o) => !o)}
              aria-expanded={offen}
              className={cn(
                "relative flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px]",
                offen || mehrAktiv ? "font-medium text-primary" : "text-muted-foreground"
              )}
            >
              <span className="relative">
                <MoreHorizontalIcon className="size-5" />
                {offeneDiensteAnzahl > 0 && (
                  <span className="absolute -top-1 -right-2 flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-4 font-semibold text-white">
                    {offeneDiensteAnzahl}
                  </span>
                )}
              </span>
              Mehr
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
