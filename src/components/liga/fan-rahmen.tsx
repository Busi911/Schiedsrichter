import Link from "next/link";
import { cn } from "@/lib/utils";

// Eigene Erscheinung der öffentlichen Fan-Web-App: farbiges Kopfband und
// vereinsspezifische Akzentfarbe (Farbton aus dem Vereins-Slug, siehe
// lib/liga-pwa.ts) — nutzt die bestehenden Design-Tokens, überschreibt sie
// nur innerhalb von .fan (auch im Dark Mode, der der Systemeinstellung folgt).
export function FanTheme({ hue }: { hue: number }) {
  const h = Math.round(hue);
  return (
    <style>{`.fan{--primary:oklch(0.42 0.12 ${h});--primary-foreground:oklch(0.98 0 0);--ring:oklch(0.42 0.12 ${h} / 0.5);--accent:oklch(0.93 0.03 ${h});--accent-foreground:oklch(0.3 0.1 ${h})}@media (prefers-color-scheme: dark){.fan{--primary:oklch(0.62 0.12 ${h});--primary-foreground:oklch(0.14 0.02 ${h});--accent:oklch(0.3 0.05 ${h});--accent-foreground:oklch(0.92 0.04 ${h})}}`}</style>
  );
}

export function FanKopf({
  titel,
  untertitel,
  initialen,
  logoUrl,
  aktiv,
}: {
  titel: string;
  untertitel?: string;
  initialen?: string;
  logoUrl?: string;
  aktiv?: "vereine" | "meine";
}) {
  const navLink = (href: string, label: string, key: "vereine" | "meine") => (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-sm font-medium transition",
        aktiv === key ? "bg-primary-foreground/20" : "hover:bg-primary-foreground/10"
      )}
    >
      {label}
    </Link>
  );
  return (
    <header className="bg-primary text-primary-foreground">
      <div className="mx-auto max-w-3xl px-4 pt-4 pb-5">
        <nav className="mb-4 flex items-center gap-1" aria-label="Hauptnavigation">
          {navLink("/verein", "Vereine", "vereine")}
          {navLink("/meine", "Meine Mannschaften", "meine")}
        </nav>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-xl bg-white object-contain p-1"
            />
          ) : (
            initialen && (
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15 font-heading text-lg font-extrabold tracking-tight"
            >
              {initialen}
            </span>
            )
          )}
          <div className="min-w-0">
            <p className="font-heading truncate text-xl leading-tight font-bold sm:text-2xl">{titel}</p>
            {untertitel && <p className="truncate text-sm opacity-80">{untertitel}</p>}
          </div>
        </div>
      </div>
    </header>
  );
}
