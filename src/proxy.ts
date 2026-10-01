import { auth } from "@/auth";

const publicRoutes = [
  "/",
  "/login",
  "/login/verify",
  "/setup",
  "/datenschutz",
  "/impressum",
  "/registrieren",
  "/verein",
  "/meine",
  "/sitemap.xml",
  "/robots.txt",
];

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    // Öffentliche Vereins-/Mannschaftsseiten (nur öffentliche Sportdaten aus
    // nuLiga, indexierbar) — siehe src/app/verein/[slug]/page.tsx.
    pathname.startsWith("/verein/") ||
    pathname.startsWith("/meine/") ||
    pathname.startsWith("/api/liga/") ||
    pathname.startsWith("/api/fan/") ||
    // Öffentliche, login-freie Lese-Ansicht (Kenntnis des Tokens ist die
    // Berechtigung) — siehe src/app/turnier/[token]/page.tsx.
    pathname.startsWith("/turnier/") ||
    // Öffentliche, login-freie Selbsteintragung für Zeitnehmer/Sekretär
    // (Kenntnis des Tokens ist die Berechtigung) — siehe
    // src/app/zeitnehmer-eintragen/[token]/page.tsx.
    pathname.startsWith("/zeitnehmer-eintragen/") ||
    // Öffentliche, login-freie Selbsteintragung für Ordner/Kioskdienst,
    // analog zu /zeitnehmer-eintragen/ — siehe
    // src/app/ordner-eintragen/[token]/page.tsx.
    pathname.startsWith("/ordner-eintragen/") ||
    // Öffentlicher ICS-Kalender-Feed (Kenntnis des Tokens ist die
    // Berechtigung) — Kalender-Apps rufen das anonym ab, ohne Login-Session,
    // siehe src/app/kalender/[token]/route.ts.
    pathname.startsWith("/kalender/") ||
    // Öffentliche, login-freie Bestätigung einer E-Mail-Adressänderung
    // (Kenntnis des Tokens ist die Berechtigung, der Link wird oft in einem
    // separaten Mail-Client/Tab ohne aktive Session geöffnet) — siehe
    // src/app/profil/email-bestaetigen/[token]/page.tsx.
    pathname.startsWith("/profil/email-bestaetigen/") ||
    // Statische Produkttour-Screenshots auf der (öffentlichen) Startseite —
    // ohne diese Ausnahme leitet die Middleware auch anonyme Bild-Requests
    // unter public/produkttour auf /login um (der Matcher unten schließt nur
    // _next/static/_next/image/favicon.ico aus, nicht beliebige
    // public/-Assets), und die Bilder blieben für nicht eingeloggte
    // Besucher:innen unsichtbar.
    pathname.startsWith("/produkttour/") ||
    // Marken-Logos und App-Icons/Manifeste (Startseite, Login, Favicon,
    // "Zum Home-Bildschirm") müssen auch ohne Login ladbar sein.
    pathname.startsWith("/brand/") ||
    pathname.startsWith("/icons/") ||
    /^\/(icon|apple-touch-icon|manifest)[^/]*\.(png|svg|json|webmanifest)$/.test(pathname);

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
