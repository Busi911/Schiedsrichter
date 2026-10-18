import { appUrl } from "@/lib/app-url";
import { breadcrumbJsonLd, jsonLdText } from "@/lib/liga-seo";

export type Brotkrume = { name: string; href: string };

// Brotkrumen NUR als BreadcrumbList-JSON-LD für Suchmaschinen (Betreiber 18.10.2026: die sichtbare Leiste war in der App unnötig,
// unten gibt es die Bottom-Bar und "Zurück"). Rendert nichts Sichtbares. Server-Komponente.
export function Brotkrumen({ kette }: { kette: Brotkrume[] }) {
  const basis = appUrl();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdText(breadcrumbJsonLd(kette.map((k) => ({ name: k.name, url: `${basis}${k.href}` })))) }}
    />
  );
}
