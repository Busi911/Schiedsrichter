// Ansprache eines Vereins in Vorbereitung (z.B. per Instagram-Nachricht): Text und Instagram-Name, rein/testbar.
// Gesendet wird bewusst von Hand — es gibt keinen automatischen Versand.

const NAME = /^[A-Za-z0-9._]{1,30}$/;

// "@hsg_linden", "hsg_linden", "instagram.com/hsg_linden/" oder die volle Profil-URL -> Name + Profil-Link.
export function normalisiereInstagram(roh: string): { name: string; url: string } | null {
  let t = roh.trim();
  if (!t) return null;
  const url = t.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i);
  if (url) t = url[1];
  t = t.replace(/^@/, "");
  if (!NAME.test(t) || t.startsWith(".") || t.endsWith(".") || t.includes("..")) return null;
  const name = t.toLowerCase();
  return { name, url: `https://www.instagram.com/${name}/` };
}

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

// Vorschlag für die erste Nachricht (Beta-Phase, kostenlos). Der Absender kann den Text vor dem Kopieren ändern.
export function ansprachetext(opt: { vereinsname: string; vorschauUrl: string; gueltigBis: Date; absender: string }): string {
  return [
    `Hallo ${opt.vereinsname}-Team,`,
    "",
    `ich bin ${opt.absender} von HandballerPate, einer App für Handballvereine. Sie macht zwei Dinge:`,
    "",
    `1. Eine App-Seite für Spieler, Eltern und Fans mit Spielplan, Ergebnissen, Tabellen und Statistiken eurer Mannschaften. Die haben wir für euch schon vorbereitet: ${opt.vorschauUrl}`,
    "",
    "2. Für den Verein selbst: Schiedsrichter, Zeitnehmer und andere Dienste bei Heimspielen planen, mit Erinnerungen per Mail.",
    "",
    "HandballerPate ist gerade in der Beta-Phase und für euch noch kostenlos.",
    "",
    `Schaut euch die Vorschau gern in Ruhe an (der Link ist bis ${DATUM.format(opt.gueltigBis)} gültig). Bei Fragen melde ich mich gern oder rufe an. Und wenn es nicht passt, reicht ein kurzes „Kein Interesse“.`,
    "",
    "Viele Grüße",
    opt.absender,
  ].join("\n");
}
