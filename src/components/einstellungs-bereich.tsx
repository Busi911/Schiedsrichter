import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Einklappbarer Bereich der Einstellungsseite (natives <details>, daher ohne
// JS, mit Tastatur bedienbar und auch in Server Components nutzbar). Zugeklappt
// bleibt nur Titel + Kurzbeschreibung stehen — die Seite wird so zu einer
// kompakten Liste statt einer langen Kartenwand. Formulare im aufgeklappten
// Teil verhalten sich unverändert (Server Actions).
export function EinstellungsBereich({
  titel,
  kurz,
  beschreibung,
  offen = false,
  gefahr = false,
  className,
  id,
  children,
}: {
  titel: string;
  kurz?: string;
  beschreibung?: ReactNode;
  offen?: boolean;
  gefahr?: boolean;
  className?: string;
  // Anker für Links wie /admin/einstellungen#oeffentliche-seite (Browser klappen <details> beim Sprung auf).
  id?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={offen}
      className={cn(
        "group max-w-2xl scroll-mt-6 rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10",
        gefahr && "ring-destructive/40",
        className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-heading text-base font-medium">{titel}</span>
          {kurz && <span className="block truncate text-sm text-muted-foreground">{kurz}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-4 border-t px-4 py-4">
        {beschreibung && <div className="text-sm text-muted-foreground">{beschreibung}</div>}
        {children}
      </div>
    </details>
  );
}

// Einklappbarer Unterpunkt innerhalb eines EinstellungsBereichs (z.B. die
// einzelnen Teile von "Öffentliche Vereinsseite").
export function Unterbereich({
  titel,
  kurz,
  offen = false,
  children,
}: {
  titel: string;
  kurz?: string;
  offen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={offen} className="group border-t pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-medium">{titel}</span>
          {kurz && <span className="block truncate text-xs text-muted-foreground">{kurz}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}
