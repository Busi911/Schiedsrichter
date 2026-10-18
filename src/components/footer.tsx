import Link from "next/link";
import { ThemeUmschalter } from "@/components/theme-umschalter";
import { RegistrierenLink } from "@/components/registrieren-link";

// Global im Root-Layout eingebunden (siehe src/app/layout.tsx), damit
// Datenschutz/Impressum von JEDER Seite aus erreichbar sind — nicht nur von
// den Seiten, die zufällig selbst daran gedacht haben. War vorher nur auf
// /login inline vorhanden; öffentliche Seiten wie /turnier/[token] hatten
// dadurch gar keinen Zugang dazu.
//
// Statische Server-Komponente (kein async, kein auth()): damt öffentliche
// Seiten wie /impressum, /datenschutz, /app-hilfe statisch vorgerendert
// werden können. Der "Verein registrieren"-Link wird clientseitig
// ausgeblendet, wenn der Besucher eingeloggt ist (siehe registrieren-link.tsx).
// Der "Hilfe"-Link für eingeloggte Nutzer entfällt hier — eingeloggte Layouts
// haben bereits den HilfeLink-Icon-Button im Header (siehe hilfe-link.tsx).
export function Footer() {
  return (
    <footer className="mt-auto border-t bg-background px-6 py-4">
      <nav aria-label="Weitere Seiten" className="flex flex-wrap items-center justify-center gap-x-5 text-sm text-muted-foreground">
        <Link href="/verein" className="inline-flex min-h-11 items-center underline">
          Vereine
        </Link>
        <Link href="/app-hilfe" className="inline-flex min-h-11 items-center underline">
          Hilfe zur App
        </Link>
        <Link href="/roadmap" className="inline-flex min-h-11 items-center underline">
          Roadmap
        </Link>
        <RegistrierenLink />
        <Link href="/datenschutz" className="inline-flex min-h-11 items-center underline">
          Datenschutz
        </Link>
        <Link href="/impressum" className="inline-flex min-h-11 items-center underline">
          Impressum
        </Link>
      </nav>
      <div className="mt-2 flex justify-center">
        <ThemeUmschalter />
      </div>
    </footer>
  );
}
