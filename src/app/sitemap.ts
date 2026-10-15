import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";
import { holeAlleVereineFuerSitemap, holeMannschaften } from "@/lib/liga-oeffentlich";

// Alle öffentlichen Vereins- und Mannschaftsseiten für Suchmaschinen. Bewusst OHNE lastmod: der Sync schreibt die Spiele bei jedem
// Lauf neu, es gibt keinen Zeitstempel für eine tatsächliche inhaltliche Änderung — ein erfundenes lastmod würde Google ignorieren.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const basis = appUrl();
  const eintraege: MetadataRoute.Sitemap = [
    { url: basis, changeFrequency: "weekly", priority: 1 },
    { url: `${basis}/verein`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${basis}/app-hilfe`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${basis}/registrieren`, changeFrequency: "monthly", priority: 0.5 },
  ];
  for (const v of await holeAlleVereineFuerSitemap()) {
    eintraege.push({
      url: `${basis}/verein/${v.slug}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
    for (const pfad of ["/spiele", "/mannschaften", "/statistik"]) {
      eintraege.push({
        url: `${basis}/verein/${v.slug}${pfad}`,
          changeFrequency: "daily",
        priority: 0.7,
      });
    }
    for (const m of await holeMannschaften(v.id)) {
      for (const pfad of ["", "/spielplan", "/ergebnisse", "/tabelle"]) {
        eintraege.push({
          url: `${basis}/verein/${v.slug}/${m.slug}${pfad}`,
              changeFrequency: "daily",
          priority: pfad === "" ? 0.7 : 0.5,
        });
      }
    }
  }
  return eintraege;
}
