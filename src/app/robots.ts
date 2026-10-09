import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/verein/"],
        // Private bzw. token-geschützte Seiten (Eintragungs-Links, Abmeldung, Turnier-Ansicht, Kalender-Abos) nie in Suchergebnisse/KI-Antworten.
        disallow: ["/admin", "/profil", "/system", "/api/", "/login", "/turnier/", "/kalender/", "/eintragen/", "/zeitnehmer-eintragen/", "/ordner-eintragen/", "/abmelden/", "/gesperrt"],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
