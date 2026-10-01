import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine } from "@/db/schema";
import { pruefeVorschauToken, VORSCHAU_COOKIE } from "@/lib/verein-vorschau";

// Einlösen eines geheimen Vorschau-Links: setzt ein Cookie (für diesen einen
// Verein gültig; Pfad "/", damit auch /meine und die Favoriten-API ihn sehen) und leitet auf die Startseite um, damit der Token nicht in der
// Adresszeile/im Verlauf der Folgeseiten bleibt. Ungültig/abgelaufen/
// widerrufen/falscher Verein: 404 (verrät nichts über den Verein).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const [lv] = await adminDb.select({ vereinId: ligaVereine.vereinId }).from(ligaVereine).where(eq(ligaVereine.slug, slug));
  const link = await pruefeVorschauToken(token);
  if (!lv || !link || link.vereinId !== lv.vereinId) return new Response("Not found", { status: 404 });

  const antwort = NextResponse.redirect(new URL(`/verein/${slug}`, request.url));
  antwort.cookies.set(VORSCHAU_COOKIE, token, {
    path: "/",
    expires: link.gueltigBis,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
  antwort.headers.set("Cache-Control", "no-store");
  antwort.headers.set("Referrer-Policy", "no-referrer");
  return antwort;
}
