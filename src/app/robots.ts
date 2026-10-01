import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/verein/"],
        disallow: ["/admin", "/profil", "/system", "/api/", "/login", "/turnier/", "/kalender/"],
      },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
