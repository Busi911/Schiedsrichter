"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { aktuellerBereich, seiteAktiv, SYSTEM_BEREICHE } from "@/lib/system-navigation";

// Zwei Ebenen: oben die Bereiche, darunter (nur bei Bereichen mit mehreren Seiten) die Unterseiten des aktuellen Bereichs. Auf Mobile wrappt die Nav als
// eigene Zeile unter das Logo (zentriert, siehe CLAUDE.md "Mobile-Optimierung").
export function SystemNav() {
  const pathname = usePathname();
  const bereich = aktuellerBereich(pathname);
  const unter = bereich && bereich.unter.length > 1 ? bereich.unter : null;

  return (
    <div className="flex flex-col items-center gap-1.5 md:items-start">
      <nav className="flex flex-wrap justify-center gap-1 md:justify-start" aria-label="Bereiche">
        {SYSTEM_BEREICHE.map((b) => (
          <Link
            key={b.key}
            href={b.unter[0].href}
            aria-current={bereich?.key === b.key ? "page" : undefined}
            className={cn(buttonVariants({ variant: bereich?.key === b.key ? "secondary" : "ghost", size: "sm" }))}
          >
            {b.label}
          </Link>
        ))}
      </nav>
      {unter && (
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm md:justify-start" aria-label={`${bereich!.label}: Unterseiten`}>
          {unter.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={seiteAktiv(pathname, s.href) ? "page" : undefined}
              className={cn("py-1 hover:text-foreground", seiteAktiv(pathname, s.href) ? "border-b-2 border-primary font-medium text-foreground" : "text-muted-foreground")}
            >
              {s.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
