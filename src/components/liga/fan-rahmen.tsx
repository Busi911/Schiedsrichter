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
        "inline-flex min-h-11 items-center rounded-full border-2 px-4 text-base font-semibold transition active:scale-95",
        aktiv === key
          ? "border-primary-foreground bg-primary-foreground text-primary shadow-md"
          : "border-primary-foreground/40 hover:bg-primary-foreground/10"
      )}
    >
      {label}
    </Link>
  );
  // Auf den Listen (Vereine / Meine Mannschaften) sind die Schaltflächen die Hauptnavigation: groß und
  // abgehoben. Auf Vereins- und Mannschaftsseiten stören sie nur — dort als schlanke Textzeile.
  const kompakt = aktiv === undefined;
  const dezent = (href: string, label: string) => (
    <Link
      href={href}
      className="-my-1 inline-flex items-center py-2 text-sm font-medium opacity-80 transition hover:opacity-100 active:opacity-100"
    >
      {label}
    </Link>
  );
  return (
    <header className="bg-primary text-primary-foreground">
      <div className={cn("mx-auto max-w-3xl px-4", kompakt ? "pt-2 pb-4" : "pt-4 pb-5")}>
        {kompakt ? (
          <nav className="mb-1 flex items-center gap-5" aria-label="Hauptnavigation">
            {dezent("/verein", "Vereine")}
            {dezent("/meine", "Meine Mannschaften")}
          </nav>
        ) : (
          <nav className="mb-4 flex items-center gap-2" aria-label="Hauptnavigation">
            {navLink("/verein", "Vereine", "vereine")}
            {navLink("/meine", "Meine Mannschaften", "meine")}
          </nav>
        )}
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
