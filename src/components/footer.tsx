import Link from "next/link";
import { auth } from "@/auth";

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
        {!eingeloggt && (
          <>
            <Link href="/registrieren" className="underline">
              Verein registrieren
            </Link>
            {" · "}
          </>
        )}
        <Link href="/hilfe" className="underline">
          Hilfe
        </Link>
        {" · "}
        <Link href="/datenschutz" className="underline">
          Datenschutz
        </Link>
        {" · "}
        <Link href="/impressum" className="underline">
          Impressum
        </Link>
      </p>
    </footer>
  );
}
