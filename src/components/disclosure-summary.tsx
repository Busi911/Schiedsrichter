import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Bündelt die bislang 6-fach identisch kopierte DISCLOSURE_KLASSE-Konstante
// (Button-Optik für ein <summary> in einem <details>-Aufklapp-Element,
// z.B. "Neue Person anlegen"/"Bearbeiten") in einer Komponente statt einer
// Klassen-Konstante — className bleibt überschreibbar (siehe cn), für Fälle
// wie das kleinere "text-[0.7rem]" in profil/zeitnehmerwart/page.tsx.
export function DisclosureSummary({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <summary
      className={cn(
        buttonVariants({ variant: "outline", size: "xs" }),
        "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
        className
      )}
    >
      {children}
    </summary>
  );
}
