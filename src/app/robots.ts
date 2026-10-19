import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/verein/"],
        // /demo bewusst NICHT gesperrt: die Seite setzt noindex, und das kann ein Crawler nur lesen, wenn er sie abrufen darf.
        // Vorschau-Links (/verein/<slug>/vorschau/<token>) sind nur zeitlich begrenzt online und nie für Suchmaschinen gedacht.
        // Private bzw. token-geschützte Seiten (Eintragungs-Links, Abmeldung, Turnier-Ansicht, Kalender-Abos) nie in Suchergebnisse/KI-Antworten.
        disallow: ["/admin", "/profil", "/system", "/api/", "/login", "/turnier/", "/kalender/", "/eintragen/", "/zeitnehmer-eintragen/", "/ordner-eintragen/", "/trainer-eintragen/", "/abmelden/", "/gesperrt", "/verein/*/vorschau/", "/podcast"],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
