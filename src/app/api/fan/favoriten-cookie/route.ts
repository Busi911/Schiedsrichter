import { cookies } from "next/headers";
import { parseFavoriten } from "@/lib/liga-favoriten-parse";

// Server-seitig gesetzter Spiegel der Fan-Favoriten (nur öffentliche IDs von
// Verein/Mannschaft, keine Personendaten). Hintergrund: Safari/iOS löscht
// per JavaScript geschriebene Daten (localStorage) nach ~7 Tagen ohne Besuch —
// ein per Set-Cookie gesetztes First-Party-Cookie bleibt dagegen erhalten.
// Bewusst NICHT unter /api/liga/: der Service Worker cached diesen Pfad.
const NAME = "hp_fav";
const MAX_JE_ART = 40; // Cookie-Limit ~4 KB
const EIN_JAHR = 60 * 60 * 24 * 365;

const KEINE_CACHES = { "Cache-Control": "no-store" };

export async function GET() {
  const roh = (await cookies()).get(NAME)?.value ?? null;
  return Response.json(parseFavoriten(roh), { headers: KEINE_CACHES });
}

export async function POST(request: Request) {
  let body: string;
  try {
    body = await request.text();
  } catch {
    return new Response(null, { status: 400 });
  }
  const f = parseFavoriten(body);
  const klein = { vereine: f.vereine.slice(-MAX_JE_ART), mannschaften: f.mannschaften.slice(-MAX_JE_ART) };
  const store = await cookies();
  if (klein.vereine.length === 0 && klein.mannschaften.length === 0) {
    store.delete(NAME);
  } else {
    store.set(NAME, JSON.stringify(klein), {
      maxAge: EIN_JAHR,
      path: "/",
      sameSite: "lax",
      secure: true,
      httpOnly: true,
    });
  }
  return new Response(null, { status: 204, headers: KEINE_CACHES });
}
