import Link from "next/link";
import { CircleHelpIcon } from "lucide-react";

// Kleiner "Hilfe dazu"-Link an einer Seite, der direkt zum passenden Abschnitt der Hilfe springt (/hilfe#anker). So
// finden Nutzer die Erklärung genau dort, wo die Frage entsteht.
export function HilfeHinweis({ anker, text = "Hilfe dazu" }: { anker: string; text?: string }) {
  return (
    <Link
      href={`/hilfe#${anker}`}
      className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <CircleHelpIcon className="size-3.5" aria-hidden />
      {text}
    </Link>
  );
}
