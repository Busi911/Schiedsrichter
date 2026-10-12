import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Deutsche 404-Seite (statt der englischen Next.js-Standardseite): zeigt Handballern, die sich beim Vereinsnamen oder
// bei einem alten Link vertippt haben, den Weg zur Vereinssuche.
export const metadata = { title: "Seite nicht gefunden | HandballerPate", robots: { index: false } };

export default function NichtGefunden() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="font-heading text-2xl font-bold">Seite nicht gefunden</h1>
      <p className="text-muted-foreground">
        Diesen Verein oder diese Mannschaft gibt es hier nicht (mehr), oder der Link ist nicht vollständig.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/verein" className={cn(buttonVariants({ size: "lg" }), "min-h-11")}>
          Verein suchen
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11")}>
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
