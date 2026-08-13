import { auth } from "@/auth";

const publicRoutes = [
  "/",
  "/login",
  "/login/verify",
  "/setup",
  "/datenschutz",
  "/impressum",
];

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron/") ||
    // Öffentliche, login-freie Lese-Ansicht (Kenntnis des Tokens ist die
    // Berechtigung) — siehe src/app/turnier/[token]/page.tsx.
    pathname.startsWith("/turnier/") ||
    // Öffentliche, login-freie Selbsteintragung für Zeitnehmer/Sekretär
    // (Kenntnis des Tokens ist die Berechtigung) — siehe
    // src/app/zeitnehmer-eintragen/[token]/page.tsx.
    pathname.startsWith("/zeitnehmer-eintragen/");

  if (!isLoggedIn && !isPublicRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
