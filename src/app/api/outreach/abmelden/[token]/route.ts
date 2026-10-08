import { fuehreOutreachAbmeldungAus } from "@/lib/outreach-abmelden";

// Outreach-Abmeldung: Ein Klick auf den Abmeldelink in der Outreach-Mail
// trägt den Verein als abgemeldet ein. Danach keine weiteren Mails.
// Die Route gibt eine einfache Bestätigungsseite zurück.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ergebnis = fuehreOutreachAbmeldungAus(token);
  if (!ergebnis.ok) {
    return new Response("Abmeldung nicht möglich — der Link ist ungültig.", {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return new Response(
    `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;color:#18181b;"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px;text-align:center;"><h1 style="font-size:20px;margin:0 0 12px;">Abmeldung bestätigt</h1><p style="color:#52525b;font-size:15px;line-height:1.6;">Du erhältst keine weiteren Mails von HandballerPate zu diesem Verein.</p></div></body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
