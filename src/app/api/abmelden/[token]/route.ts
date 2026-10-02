import { NextResponse } from "next/server";
import { pruefeAbmeldeToken, setzeAbmeldung } from "@/lib/abmelden";

// Ein-Klick-Abmeldung nach RFC 8058: Gmail/Outlook senden bei "Abbestellen" einen POST an die URL aus dem
// List-Unsubscribe-Header (Body "List-Unsubscribe=One-Click"). Ein GET (z.B. Mail-Scanner, Browser) ändert
// nichts, sondern führt zur Bestätigungsseite.
export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gueltig = pruefeAbmeldeToken(token);
  if (!gueltig) return new NextResponse("Ungültiger Link.", { status: 400 });
  await setzeAbmeldung(gueltig.userId, gueltig.art, false);
  return new NextResponse("Abgemeldet.", { status: 200 });
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/abmelden/${token}`, request.url));
}
