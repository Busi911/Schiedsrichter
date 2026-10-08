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
  Building2Icon,
  ClipboardCheckIcon,
  ListOrderedIcon,
  MessageSquareIcon,
  HandHelpingIcon,
  KeyRoundIcon,
  ShieldIcon,
  WalletIcon,
  DatabaseIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/submit-button";
import { LinkSymbol } from "@/components/link-spinner";

// Mobile-Navigation wie in einer nativen App (nur unter md — auf Desktop
// bleibt die jeweilige Kopfzeilen-Nav). Bis zu MAX_TABS Bereiche direkt
// erreichbar, alles Übrige (plus zusätzliche Sheet-Einträge und Logout) im
// "Mehr"-Sheet. Vom Server als Daten konfiguriert (Icons über Namen, da
// Komponenten nicht über die Server/Client-Grenze gereicht werden können) —
// genutzt im Admin-Bereich und auf /profil.
const ICONS = {
  home: HomeIcon,
  kalender: CalendarDaysIcon,
  termine: ClipboardListIcon,
  training: DumbbellIcon,
  dienste: HandHelpingIcon,
  mannschaften: UsersRoundIcon,
  funktionstraeger: UsersIcon,
  auswertung: BarChart3Icon,
  einstellungen: SettingsIcon,
  profil: UserIcon,
  hilfe: CircleHelpIcon,
  admin: ShieldIcon,
  wart: ClipboardCheckIcon,
  passwort: KeyRoundIcon,
  vereine: Building2Icon,
  warteliste: ListOrderedIcon,
  feedback: MessageSquareIcon,
  abrechnung: WalletIcon,
  spieldaten: DatabaseIcon,
  betrieb: WrenchIcon,
} satisfies Record<string, LucideIcon>;

export type BottomNavIcon = keyof typeof ICONS;

export type BottomNavItem = {
  href: string;
  label: string;
  icon: BottomNavIcon;
  exact?: boolean;
  // Weitere Pfade, die zu diesem Eintrag gehören (z.B. Unterseiten eines Bereichs, die nicht unter `href` liegen).
  pfade?: string[];
  // Zähler als Badge (z.B. offene Dienste) — bei Einträgen im Sheet wirkt er
  // zusätzlich auf den Mehr-Tab.
  badge?: number;
};

const MAX_TABS = 4;

function Icon({ name, className }: { name: BottomNavIcon; className?: string }) {
  const Komponente = ICONS[name];
  return <Komponente className={className} />;
}

function istAktiv(pathname: string | null, href: string, exact?: boolean, pfade?: string[]) {
  const trifft = (h: string) => (exact ? pathname === h : pathname === h || !!pathname?.startsWith(h + "/"));
  return trifft(href) || !!pfade?.some((p) => pathname === p || !!pathname?.startsWith(p + "/"));
}

export function BottomNav({
  tabs,
  mehrItems,
  logoutAction,
}: {
  // Mehr als MAX_TABS Tabs: der Rest wandert vorn in das Mehr-Sheet.
  tabs: BottomNavItem[];
  mehrItems: BottomNavItem[];
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [offen, setOffen] = useState(false);
  const direkt = tabs.slice(0, MAX_TABS);
  const sheetItems = [...tabs.slice(MAX_TABS), ...mehrItems];
  const mehrBadge = sheetItems.reduce((summe, i) => summe + (i.badge ?? 0), 0);
  const mehrAktiv = sheetItems.some((i) => istAktiv(pathname, i.href, i.exact, i.pfade));

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
          className="fixed inset-x-0 bottom-20 z-50 mx-3 flex flex-col gap-1 rounded-xl border bg-background p-2 shadow-xl"
        >
          {sheetItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOffen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                istAktiv(pathname, item.href, item.exact, item.pfade) ? "bg-secondary font-medium" : "hover:bg-muted"
              )}
            >
              <LinkSymbol className="size-4 text-muted-foreground">
                <Icon name={item.icon} className="size-4 text-muted-foreground" />
              </LinkSymbol>
              <span className="flex-1">{item.label}</span>
              {!!item.badge && <Badge variant="warning">{item.badge}</Badge>}
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
        className="fixed inset-x-0 bottom-0 z-50 border-t border-foreground/15 bg-card shadow-[0_-4px_16px_rgba(0,0,0,0.08)] dark:border-foreground/25 dark:shadow-[0_-6px_20px_rgba(0,0,0,0.6)] pb-[max(env(safe-area-inset-bottom),1rem)]"
      >
        <ul className="mx-auto flex h-16 max-w-md items-stretch px-2">
          {direkt.map((tab) => {
            const aktiv = istAktiv(pathname, tab.href, tab.exact, tab.pfade);
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
                  <LinkSymbol className="size-5">
                    <Icon name={tab.icon} className="size-5" />
                  </LinkSymbol>
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
                {mehrBadge > 0 && (
                  <span className="absolute -top-1 -right-2 flex min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] leading-4 font-semibold text-white">
                    {mehrBadge}
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
