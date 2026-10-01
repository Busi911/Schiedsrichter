import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";
import { holeAlleVereineFuerSitemap, holeMannschaften } from "@/lib/liga-oeffentlich";

// Alle öffentlichen Vereins- und Mannschaftsseiten für Suchmaschinen.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const basis = appUrl();
  const eintraege: MetadataRoute.Sitemap = [
    { url: basis, changeFrequency: "monthly", priority: 0.5 },
    { url: `${basis}/verein`, changeFrequency: "weekly", priority: 0.6 },
  ];
  for (const v of await holeAlleVereineFuerSitemap()) {
    eintraege.push({
      url: `${basis}/verein/${v.slug}`,
      lastModified: v.spieleSynchronisiertAm ?? undefined,
      changeFrequency: "daily",
      priority: 0.8,
    });
    for (const pfad of ["/spiele", "/mannschaften"]) {
      eintraege.push({
        url: `${basis}/verein/${v.slug}${pfad}`,
        lastModified: v.spieleSynchronisiertAm ?? undefined,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
    for (const m of await holeMannschaften(v.id)) {
      for (const pfad of ["", "/spielplan", "/ergebnisse", "/tabelle"]) {
        eintraege.push({
          url: `${basis}/verein/${v.slug}/${m.slug}${pfad}`,
          lastModified: v.spieleSynchronisiertAm ?? undefined,
          changeFrequency: "daily",
          priority: pfad === "" ? 0.7 : 0.5,
        });
      }
    }
  }
  return eintraege;
}
