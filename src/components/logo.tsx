import Image from "next/image";
import { cn } from "@/lib/utils";

// Rundes Markenlogo für Kopfzeilen (eingeloggte Bereiche, Login, öffentliche
// Token-Seiten). Die große Variante mit Schriftzug gehört nur auf die
// Startseite (public/brand/logo-gross.png).
export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-rund.png"
      alt=""
      width={256}
      height={243}
      className={cn("object-contain", className)}
      aria-hidden="true"
    />
  );
}
