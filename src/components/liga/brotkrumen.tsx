import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { appUrl } from "@/lib/app-url";
import { breadcrumbJsonLd, jsonLdText } from "@/lib/liga-seo";

export type Brotkrume = { name: string; href: string };

// Sichtbare Brotkrumen (Orientierung, interne Verlinkung) UND dieselbe Kette als BreadcrumbList-JSON-LD. Das letzte Element ist die
// aktuelle Seite und nicht verlinkt. Server-Komponente: die Links stehen im ausgelieferten HTML.
export function Brotkrumen({ kette }: { kette: Brotkrume[] }) {
  const basis = appUrl();
  return (
    <nav aria-label="Brotkrumen" className="text-sm text-muted-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(breadcrumbJsonLd(kette.map((k) => ({ name: k.name, url: `${basis}${k.href}` })))) }}
      />
      <ol className="flex flex-wrap items-center gap-x-1">
        {kette.map((k, i) => {
          const letzte = i === kette.length - 1;
          return (
            <li key={k.href} className="flex min-w-0 items-center gap-x-1">
              {letzte ? (
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {k.name}
                </span>
              ) : (
                <>
                  <Link href={k.href} className="inline-flex min-h-8 items-center truncate hover:text-foreground hover:underline">
                    {k.name}
                  </Link>
                  <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
