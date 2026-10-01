import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaVereine } from "@/db/schema";
import { holeLogoPng } from "@/lib/liga-oeffentlich";
import { pruefeVorschauToken, VORSCHAU_COOKIE } from "@/lib/verein-vorschau";

// Einlösen eines geheimen Vorschau-Links: setzt ein Cookie (für diesen einen
// Verein gültig; Pfad "/", damit auch /meine und die Favoriten-API ihn sehen) und leitet auf die Startseite um, damit der Token nicht in der
// Adresszeile/im Verlauf der Folgeseiten bleibt. Ungültig/abgelaufen/
// widerrufen/falscher Verein: 404 (verrät nichts über den Verein).
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const [lv] = await adminDb.select({ id: ligaVereine.id, vereinId: ligaVereine.vereinId, name: ligaVereine.name }).from(ligaVereine).where(eq(ligaVereine.slug, slug));
  const link = await pruefeVorschauToken(token);
  if (!lv || !link || link.vereinId !== lv.vereinId) return new Response("Not found", { status: 404 });

  // Link-Vorschau-Crawler (WhatsApp, Slack, …) speichern kein Cookie und würden
  // nach der Umleitung auf eine 404-Seite laufen — sie bekommen stattdessen
  // eine kleine Seite mit Titel und Logo (gleiches Gültigkeitsprüfung, nur Name/Logo).
  if (/WhatsApp|facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Applebot|SkypeUriPreview|iMessage/i.test(request.headers.get("user-agent") ?? "")) {
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const logo = (await holeLogoPng(lv.id)) ? `<meta property="og:image" content="${new URL(`/verein/${slug}/vorschau/${token}/logo`, request.url).href}">` : "";
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(lv.name)}</title><meta name="robots" content="noindex"><meta property="og:title" content="${esc(lv.name)}"><meta property="og:description" content="Vorschau der Vereinsseite"><meta property="og:type" content="website">${logo}</head><body>${esc(lv.name)}</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

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
