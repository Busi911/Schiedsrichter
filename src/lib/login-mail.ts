import "server-only";

export function loginMailText(url: string) {
  return [
    "Dein Login-Link für Handballpate:",
    url,
    "",
    "Der Link ist eine kurze Zeit gültig und nur einmal verwendbar.",
    "Falls du diese Mail nicht angefordert hast, kannst du sie einfach ignorieren.",
  ].join("\n");
}

// Bewusst reine Inline-Styles + Tabellen-Layout statt Tailwind-Klassen: die
// meisten E-Mail-Clients (allen voran Outlook Desktop) ignorieren <style>-
// Blöcke und Flexbox/Grid — nur Inline-CSS auf Tabellen ist zuverlässig.
export function loginMailHtml(url: string) {
  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:32px 32px 8px;text-align:center;">
                <div style="width:48px;height:48px;margin:0 auto 16px;border-radius:14px;background:#1c1c1e;text-align:center;line-height:48px;">
                  <span style="color:#f97316;font-size:22px;">●</span>
                </div>
                <h1 style="margin:0;font-size:20px;color:#18181b;">Handballpate</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;text-align:center;color:#52525b;font-size:15px;line-height:1.6;">
                Klick auf den Button, um dich einzuloggen. Der Link ist kurz
                gültig und nur einmal verwendbar — ein Passwort brauchst du
                nicht.
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;text-align:center;">
                <a href="${url}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
                  Jetzt einloggen
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;text-align:center;color:#a1a1aa;font-size:13px;line-height:1.5;">
                Funktioniert der Button nicht? Kopiere diesen Link in deinen
                Browser:<br />
                <a href="${url}" style="color:#71717a;word-break:break-all;">${url}</a>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;text-align:center;">
            Falls du diesen Login nicht angefordert hast, kannst du diese
            Mail ignorieren.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
