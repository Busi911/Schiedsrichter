import "server-only";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Normalfall ist ein einfacher String (Fließtext-Absatz, wie bisher). Für
// Mails mit mehreren gleichartigen Einträgen (z.B. mehrere Termine, siehe
// mehrfachZuordnungsMailInhalt in lib/zuordnung.ts) reicht ein flacher
// Fließtext nicht — die einzelnen Einträge liefen optisch ununterscheidbar
// ineinander. Als Objekt kann eine Zeile deshalb zusätzlich stark (fett,
// z.B. für ein Datum als visueller Anker) und/oder neueGruppe (zusätzlicher
// Abstand nach oben, markiert den Beginn eines neuen Eintrags) sein.
export type EmailZeile = string | { text: string; stark?: boolean; neueGruppe?: boolean };

export function zeileText(z: EmailZeile): string {
  return typeof z === "string" ? z : z.text;
}

// Gemeinsame Struktur für JEDE transaktionale Mail der App — siehe
// CLAUDE.md ("E-Mail-Layout") für die Konvention. vereinName weglassen bei
// Mails ohne Vereins-Kontext (z.B. Login-Link); zeilen sind Fließtext-
// Absätze; cta optional für einen Button; kleingedrucktes für einen
// unaufdringlichen Hinweis unter der Karte (z.B. "falls nicht angefordert…").
export type EmailInhalt = {
  vereinName?: string;
  ueberschrift: string;
  zeilen: EmailZeile[];
  cta?: { text: string; url: string };
  kleingedrucktes?: string;
};

export function emailAlsText(inhalt: EmailInhalt): string {
  const teile = [
    ...(inhalt.vereinName ? [inhalt.vereinName, ""] : []),
    inhalt.ueberschrift,
    ...inhalt.zeilen.map(
      (z) =>
        `${typeof z !== "string" && z.neueGruppe ? "\n" : ""}\n${zeileText(z)}`
    ),
  ];
  if (inhalt.cta) teile.push(`\n${inhalt.cta.text}: ${inhalt.cta.url}`);
  if (inhalt.kleingedrucktes) teile.push(`\n${inhalt.kleingedrucktes}`);
  return teile.join("\n");
}

// Bewusst reine Inline-Styles + Tabellen-Layout statt Tailwind-Klassen — die
// meisten E-Mail-Clients (allen voran Outlook Desktop) ignorieren <style>-
// Blöcke und Flexbox/Grid, nur Inline-CSS auf Tabellen ist zuverlässig.
export function emailAlsHtml(inhalt: EmailInhalt): string {
  const linksbuendig = !!inhalt.vereinName;
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
                ${
                  inhalt.vereinName
                    ? `<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#a1a1aa;">${escapeHtml(inhalt.vereinName)}</p>`
                    : ""
                }
                <h1 style="margin:0;font-size:${linksbuendig ? "18" : "20"}px;color:#18181b;">HandballerPate</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 8px;text-align:${linksbuendig ? "left" : "center"};color:#18181b;font-size:15px;line-height:1.6;">
                ${escapeHtml(inhalt.ueberschrift)}
              </td>
            </tr>
            ${inhalt.zeilen
              .map((z) => {
                const stark = typeof z !== "string" && !!z.stark;
                const neueGruppe = typeof z !== "string" && !!z.neueGruppe;
                return `
            <tr>
              <td style="padding:${neueGruppe ? 16 : 0}px 32px 4px;text-align:${linksbuendig ? "left" : "center"};color:${stark ? "#18181b" : "#52525b"};font-size:14px;font-weight:${stark ? 600 : 400};line-height:1.6;">
                ${escapeHtml(zeileText(z))}
              </td>
            </tr>`;
              })
              .join("")}
            ${
              inhalt.cta
                ? `
            <tr>
              <td style="padding:16px 32px 8px;text-align:center;">
                <a href="${inhalt.cta.url}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;">
                  ${escapeHtml(inhalt.cta.text)}
                </a>
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:24px 32px 32px;"></td>
            </tr>
          </table>
          ${
            inhalt.kleingedrucktes
              ? `<p style="margin:24px 0 0;color:#a1a1aa;font-size:12px;text-align:center;">${escapeHtml(inhalt.kleingedrucktes)}</p>`
              : ""
          }
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
