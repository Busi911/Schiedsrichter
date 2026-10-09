import Link from "next/link";
import { auth } from "@/auth";
import { ThemeUmschalter } from "@/components/theme-umschalter";

// Global im Root-Layout eingebunden (siehe src/app/layout.tsx), damit
// Datenschutz/Impressum von JEDER Seite aus erreichbar sind — nicht nur von
// den Seiten, die zufällig selbst daran gedacht haben. War vorher nur auf
// /login inline vorhanden; öffentliche Seiten wie /turnier/[token] hatten
// dadurch gar keinen Zugang dazu.
export async function Footer() {
  // "Verein registrieren" ist nur für anonyme Besucher relevant — wer
  // bereits eingeloggt ist (egal ob als Funktionsträger eines bestehenden
  // Vereins oder System-Admin), gehört schon zu einem Verein bzw. braucht
  // diesen Link nicht.
  const session = await auth();
  const eingeloggt = !!session?.user;

  return (
    <footer className="mt-auto border-t bg-background px-6 py-4">
      <nav aria-label="Weitere Seiten" className="flex flex-wrap items-center justify-center gap-x-5 text-sm text-muted-foreground">
        <Link href="/verein" className="inline-flex min-h-11 items-center underline">
          Vereine
        </Link>
        {!eingeloggt && (
          <>
            <Link href="/app-hilfe" className="inline-flex min-h-11 items-center underline">
              Hilfe zur App
            </Link>
            <Link href="/registrieren" className="inline-flex min-h-11 items-center underline">
              Verein registrieren
            </Link>
          </>
        )}
        {eingeloggt && (
          <>
            <Link href="/hilfe" className="inline-flex min-h-11 items-center underline">
              Hilfe
            </Link>
          </>
        )}
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
