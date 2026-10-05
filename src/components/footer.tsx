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
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/verein" className="underline">
          Vereine
        </Link>
        {" · "}
        {!eingeloggt && (
          <>
            <Link href="/registrieren" className="underline">
              Verein registrieren
            </Link>
            {" · "}
          </>
        )}
        {eingeloggt && (
          <>
            <Link href="/hilfe" className="underline">
              Hilfe
            </Link>
            {" · "}
          </>
        )}
        <Link href="/datenschutz" className="underline">
          Datenschutz
        </Link>
        {" · "}
        <Link href="/impressum" className="underline">
          Impressum
        </Link>
      </p>
      <div className="mt-3 flex justify-center">
        <ThemeUmschalter />
      </div>
    </footer>
  );
}
