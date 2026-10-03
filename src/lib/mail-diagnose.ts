import "server-only";
import { promises as dns } from "node:dns";
import { appUrl } from "./app-url";

export type MailDiagnose = {
  host: string | null;
  port: string;
  absender: string | null;
  absenderDomain: string | null;
  mx: string[];
  spf: string | null;
  dmarc: string | null;
  dkim: { selektor: string; vorhanden: boolean }[];
  hinweise: string[];
};

// Übliche DKIM-Selektoren gängiger Anbieter (kein Beweis, wenn keiner gefunden wird: der Selektor des
// eigenen Anbieters kann anders heißen — maßgeblich ist "dkim=pass" im Header einer echten Testmail).
const DKIM_SELEKTOREN = ["default", "google", "selector1", "selector2", "mail", "k1", "s1", "s2", "resend", "brevo", "smtp", "dkim", "s1-ionos", "s2-ionos", "s3-ionos"];

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((teile) => teile.join(""));
  } catch {
    return [];
  }
}

// Hauptdomain (letzte zwei Labels; für .de/.com/.org-Domains ausreichend): "www.handballerpate.de" -> "handballerpate.de"
export function hauptDomain(host: string | null): string | null {
  if (!host) return null;
  const teile = host.toLowerCase().replace(/:\d+$/, "").split(".");
  return teile.length >= 2 ? teile.slice(-2).join(".") : null;
}

export function extrahiereDomain(absender: string | null | undefined): string | null {
  if (!absender) return null;
  const m = absender.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase() : null;
}

// Prüft DNS-Einträge der Absenderdomain (SPF, DMARC, MX, übliche DKIM-Selektoren) und gibt konkrete
// Hinweise. Nur lesend; ersetzt nicht den Blick in den Header einer echten Testmail.
export async function pruefeMailKonfiguration(): Promise<MailDiagnose> {
  const absender = process.env.SMTP_FROM ?? null;
  const domain = extrahiereDomain(absender);
  const ergebnis: MailDiagnose = {
    host: process.env.SMTP_HOST ?? null,
    port: process.env.SMTP_PORT ?? "587",
    absender,
    absenderDomain: domain,
    mx: [],
    spf: null,
    dmarc: null,
    dkim: [],
    hinweise: [],
  };
  if (!ergebnis.host) ergebnis.hinweise.push("SMTP_HOST ist nicht gesetzt — es kann keine Mail versendet werden.");
  if (!domain) {
    ergebnis.hinweise.push("SMTP_FROM enthält keine gültige Absenderadresse (erwartet z.B. „HandballerPate <noreply@handballerpate.de>“).");
    return ergebnis;
  }
  try {
    ergebnis.mx = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((m) => m.exchange);
  } catch {
    ergebnis.mx = [];
  }
  ergebnis.spf = (await txt(domain)).find((t) => t.toLowerCase().startsWith("v=spf1")) ?? null;
  ergebnis.dmarc = (await txt(`_dmarc.${domain}`)).find((t) => t.toLowerCase().startsWith("v=dmarc1")) ?? null;
  ergebnis.dkim = await Promise.all(
    DKIM_SELEKTOREN.map(async (s) => ({ selektor: s, vorhanden: (await txt(`${s}._domainkey.${domain}`)).length > 0 }))
  );

  if (!ergebnis.spf) {
    ergebnis.hinweise.push(`SPF fehlt für ${domain}: ohne SPF-Eintrag stufen viele Postfächer die Mail als verdächtig ein. Den Eintrag nennt dein Mailanbieter (Include-Eintrag).`);
  } else if (!/[~-]all\b/i.test(ergebnis.spf)) {
    ergebnis.hinweise.push("SPF endet nicht mit ~all oder -all (so ist unklar, welche Server senden dürfen).");
  }
  if (!ergebnis.dmarc) {
    ergebnis.hinweise.push(`DMARC fehlt (_dmarc.${domain}): Gmail und Yahoo verlangen es und werten Mails ohne DMARC deutlich häufiger als Spam. Einstieg: v=DMARC1; p=none; rua=mailto:<deine Adresse>.`);
  }
  if (!ergebnis.dkim.some((d) => d.vorhanden)) {
    ergebnis.hinweise.push("Unter üblichen Selektoren wurde kein DKIM-Schlüssel gefunden. Das ist kein Beweis (der Selektor deines Anbieters kann abweichen) — prüfe in der Testmail im Header, ob dort „dkim=pass“ steht.");
  }
  if (ergebnis.mx.length === 0) {
    ergebnis.hinweise.push(`Für ${domain} gibt es keinen MX-Eintrag: Antworten an die Absenderadresse kommen nicht an, das wirkt unseriös.`);
  }
  let appHost: string | null = null;
  try {
    appHost = new URL(appUrl()).host;
  } catch {
    appHost = null;
  }
  const appDomain = hauptDomain(appHost);
  if (appDomain && appDomain !== "localhost" && hauptDomain(domain) !== appDomain) {
    ergebnis.hinweise.push(
      `Die Absenderdomain (${domain}) weicht von der Domain der Links in den Mails (${appDomain}) ab. Spamfilter werten das als Warnzeichen. Besser: Absender auf eine Adresse bei ${appDomain} umstellen (mit eigenem SPF/DKIM/DMARC).`
    );
  }
  if (/no-?reply/i.test(absender ?? "")) {
    ergebnis.hinweise.push("Die Absenderadresse beginnt mit „noreply“. Eine echte, erreichbare Adresse (z.B. info@…) wird von Spamfiltern besser bewertet.");
  }
  return ergebnis;
}
