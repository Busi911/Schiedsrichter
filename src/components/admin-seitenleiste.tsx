"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ICONS } from "@/components/nav-icons";
import { KONTO_TITEL, type AdminNavEintrag, type AdminNavigation } from "@/lib/admin-navigation";

// Desktop-Navigation des neuen App-Designs (ab md): feste Seitenleiste statt der Auswahlmenüs in der Kopfzeile. Gespeist aus derselben Quelle
// wie Menü und Tab-Leiste (lib/admin-navigation.ts); mobil übernimmt weiter die Tab-Leiste (bottom-nav.tsx).
function istAktiv(pathname: string | null, item: Pick<AdminNavEintrag, "href" | "exact">) {
  return item.exact ? pathname === item.href : pathname === item.href || !!pathname?.startsWith(item.href + "/");
}

function Eintrag({ item, pathname, label }: { item: AdminNavEintrag; pathname: string | null; label?: string }) {
  const Symbol = ICONS[item.icon];
  const aktiv = istAktiv(pathname, item);
  return (
    <Link
      href={item.href}
      aria-current={aktiv ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-medium",
        aktiv ? "bg-secondary font-bold text-primary" : "text-foreground/80 hover:bg-muted"
      )}
    >
      <Symbol className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{label ?? item.label}</span>
      {!!item.badge && <span className="rounded-full bg-destructive px-1.5 text-xs font-bold text-white">{item.badge}</span>}
    </Link>
  );
}

export function AdminSeitenleiste({ nav }: { nav: AdminNavigation }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
      <nav aria-label="Hauptnavigation" className="sticky top-0 flex max-h-screen flex-col gap-0.5 overflow-y-auto p-3.5">
        {nav.direkt.map((item) => (
          <Eintrag key={item.href} item={item} pathname={pathname} label={item.href === "/admin" ? "Start" : undefined} />
        ))}
        {nav.gruppen.map((gruppe) => (
          <div key={gruppe.id} className="flex flex-col gap-0.5">
            <Link
              href={`/admin/bereich/${gruppe.id}`}
              className="px-3 pt-4 pb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase hover:text-foreground"
            >
              {gruppe.titel}
            </Link>
            {gruppe.eintraege.map((item) => (
              <Eintrag key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ))}
        <p className="px-3 pt-4 pb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">{KONTO_TITEL}</p>
        {nav.konto.map((item) => (
          <Eintrag key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
}
