import "server-only";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function terminMailText(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: string[];
}) {
  return [
    params.vereinName,
    "",
    params.ueberschrift,
    ...params.zeilen.map((z) => `\n${z}`),
  ].join("\n");
}

// Bewusst reine Inline-Styles + Tabellen-Layout statt Tailwind-Klassen (wie
// login-mail.ts) — die meisten E-Mail-Clients (allen voran Outlook Desktop)
// ignorieren <style>-Blöcke und Flexbox/Grid, nur Inline-CSS auf Tabellen
// ist zuverlässig.
export function terminMailHtml(params: {
  vereinName: string;
  ueberschrift: string;
  zeilen: string[];
}) {
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
                <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#a1a1aa;">
                  ${escapeHtml(params.vereinName)}
                </p>
                <h1 style="margin:0;font-size:18px;color:#18181b;">HandballerPate</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;text-align:left;color:#18181b;font-size:15px;line-height:1.6;">
                ${escapeHtml(params.ueberschrift)}
              </td>
            </tr>
            ${params.zeilen
              .map(
                (z) => `
            <tr>
              <td style="padding:0 32px 4px;text-align:left;color:#52525b;font-size:14px;line-height:1.6;">
                ${escapeHtml(z)}
              </td>
            </tr>`
              )
              .join("")}
            <tr>
              <td style="padding:24px 32px 32px;"></td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
