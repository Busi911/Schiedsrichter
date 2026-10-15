import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/verein/"],
        // /demo bewusst NICHT gesperrt: die Seite setzt noindex, und das kann ein Crawler nur lesen, wenn er sie abrufen darf.
        // Private bzw. token-geschützte Seiten (Eintragungs-Links, Abmeldung, Turnier-Ansicht, Kalender-Abos) nie in Suchergebnisse/KI-Antworten.
        disallow: ["/admin", "/profil", "/system", "/api/", "/login", "/turnier/", "/kalender/", "/eintragen/", "/zeitnehmer-eintragen/", "/ordner-eintragen/", "/trainer-eintragen/", "/abmelden/", "/gesperrt"],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
