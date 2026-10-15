import "server-only";
import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { holeVereinsDesign } from "@/lib/liga-oeffentlich";
import { kuerzeBeschreibung } from "@/lib/liga-seo";

// Metadaten der öffentlichen Vereinsseiten. Next.js führt Metadaten je Feld GANZ zusammen: ein `openGraph` auf Seitenebene ersetzt das
// des Layouts samt Bild. Deshalb setzt jede Seite Titel, Beschreibung, Canonical UND Open Graph (inkl. Logo) über diese eine Funktion —
// sonst fehlen bei Link-Vorschauen og:title/og:url, oder das Vereinslogo geht verloren.
export async function vereinsSeitenMetadata(
  verein: { id: string; slug: string; name: string },
  seite: { titel: string; beschreibung: string; pfad: string },
): Promise<Metadata> {
  const url = `${appUrl()}/verein/${verein.slug}${seite.pfad}`;
  const beschreibung = kuerzeBeschreibung(seite.beschreibung);
  const logoVersion = (await holeVereinsDesign(verein.id)).logoVersion;
  const bild = logoVersion
    ? { url: `/verein/${verein.slug}/logo?v=${logoVersion}`, alt: `Logo ${verein.name}` }
    : { url: "/brand/logo-gross.png", width: 900, height: 634, alt: "HandballerPate" };
  return {
    title: seite.titel,
    description: beschreibung,
    alternates: { canonical: url },
    openGraph: { type: "website", locale: "de_DE", siteName: "HandballerPate", title: seite.titel, description: beschreibung, url, images: [bild] },
    twitter: { card: logoVersion ? "summary" : "summary_large_image", title: seite.titel, description: beschreibung },
  };
}
