import Link from "next/link";

// Global im Root-Layout eingebunden (siehe src/app/layout.tsx), damit
// Datenschutz/Impressum von JEDER Seite aus erreichbar sind — nicht nur von
// den Seiten, die zufällig selbst daran gedacht haben. War vorher nur auf
// /login inline vorhanden; öffentliche Seiten wie /turnier/[token] hatten
// dadurch gar keinen Zugang dazu.
export function Footer() {
  return (
    <footer className="mt-auto border-t bg-background px-6 py-4">
      <p className="text-center text-xs text-muted-foreground">
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
