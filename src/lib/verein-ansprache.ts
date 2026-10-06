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

// Absender der Ansprache (Vorname, wie er in der Nachricht steht).
export const ANSPRACHE_ABSENDER = "Dennis";

// Vorschlag für die erste Nachricht in der Sie-Form (Beta-Phase, kostenlos). Der Absender kann den Text vor dem Kopieren ändern.
export function ansprachetext(opt: { vereinsname: string; vorschauUrl: string; gueltigBis: Date; absender?: string }): string {
  const absender = opt.absender ?? ANSPRACHE_ABSENDER;
  return [
    "Guten Tag,",
    "",
    `mein Name ist ${absender}, ich komme von HandballerPate, einer App für Handballvereine. Sie macht zwei Dinge:`,
    "",
    `1. Eine App-Seite für Spieler, Eltern und Fans mit Spielplan, Ergebnissen, Tabellen und Statistiken Ihrer Mannschaften. Diese haben wir für den ${opt.vereinsname} bereits vorbereitet: ${opt.vorschauUrl}`,
    "",
    "2. Für den Verein selbst: Schiedsrichter, Zeitnehmer und andere Dienste bei Heimspielen planen, mit Erinnerungen per Mail.",
    "",
    "HandballerPate befindet sich gerade in der Beta-Phase und ist für Sie noch kostenlos.",
    "",
    `Bitte sehen Sie sich die Vorschau in Ruhe an (der Link ist bis ${DATUM.format(opt.gueltigBis)} gültig). Bei Fragen stehe ich Ihnen gern zur Verfügung. Und wenn es nicht passt, genügt eine kurze Nachricht mit „Kein Interesse“.`,
    "",
    "Viele Grüße",
    absender,
  ].join("\n");
}
