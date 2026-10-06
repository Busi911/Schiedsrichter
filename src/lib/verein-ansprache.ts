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
    `1. Eine App-Seite für Spieler, Eltern und Fans mit Spielplan, Ergebnissen, Tabellen und Statistiken Ihrer Mannschaften. Für den ${opt.vereinsname} haben wir sie schon vorbereitet: ${opt.vorschauUrl}`,
    "",
    "2. Für den Verein: Schiedsrichter, Zeitnehmer und andere Dienste bei Heimspielen planen, mit Erinnerungen per Mail.",
    "",
    `HandballerPate ist in der Beta-Phase und für Sie noch kostenlos. Die Vorschau gilt bis ${DATUM.format(opt.gueltigBis)}.`,
    "",
    "Zum Übernehmen brauche ich nur den Namen und die E-Mail-Adresse der Person, die den Verein verwalten soll. Sie melden sich dann mit einem Link an, den ich per E-Mail schicke. Wenn es nicht passt, genügt ein kurzes „Kein Interesse“.",
    "",
    "Viele Grüße",
    absender,
  ].join("\n");
}
