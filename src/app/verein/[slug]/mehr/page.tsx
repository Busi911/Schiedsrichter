import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon, DumbbellIcon, NewspaperIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { neuigkeitenOeffentlichAktiv } from "@/lib/neuigkeiten-daten";
import { trainingOeffentlichAktiv } from "@/lib/training-oeffentlich-daten";
import { ladeVereinsDaten } from "../laden";

export const metadata: Metadata = { title: "Mehr", robots: { index: false, follow: true } };

// "Mehr" der unteren Leiste: sind Training UND Neuigkeiten eingeschaltet, passen nicht alle Bereiche in die Leiste (höchstens fünf
// Plätze). Diese Seite listet dann die übrigen. Ohne eingeschaltete Zusatzbereiche gibt es sie nicht (404).
export default async function MehrSeite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { verein } = await ladeVereinsDaten(slug);
  const [training, neuigkeiten] = await Promise.all([trainingOeffentlichAktiv(verein.vereinId), neuigkeitenOeffentlichAktiv(verein.vereinId)]);
  const basis = `/verein/${verein.slug}`;
  const eintraege = [
    ...(training ? [{ href: `${basis}/training`, label: "Training", hinweis: "Zeiten und Ausfälle", Icon: DumbbellIcon }] : []),
    ...(neuigkeiten ? [{ href: `${basis}/neuigkeiten`, label: "Neuigkeiten", hinweis: "Berichte von der Vereinshomepage", Icon: NewspaperIcon }] : []),
  ];
  if (eintraege.length === 0) notFound();

  return (
    <div className="space-y-4 pb-28 md:pb-0">
      <h1 className="font-heading text-lg font-semibold">
        <span className="sr-only">{verein.name}: </span>Mehr
      </h1>
      <ul className="space-y-2">
        {eintraege.map(({ href, label, hinweis, Icon }) => (
          <li key={href}>
            <Link href={href}>
              <Card size="sm" className="flex-row items-center gap-3 px-3 py-3">
                <Icon className="size-6 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hinweis}</span>
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
