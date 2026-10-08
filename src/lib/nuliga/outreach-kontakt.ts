import "server-only";

// Extrahiert die Kontakt-E-Mail aus der nuLiga-Vereinsseite (clubInfoDisplay).
// Die nuLiga-Seite hat einen "Kontaktadresse"-Abschnitt mit Name, Adresse,
// Telefon und (oft) einer E-Mail-Adresse. Der bestehende Parser
// (vereinsinfo.ts) ignoriert diese bewusst (DSGVO-Whitelist für die App),
// aber für den Outreach brauchen wir genau diese E-Mail.
//
// Diese Funktion ist nur für den Outreach-Cron bestimmt, nie für die App
// selbst — sie liest Kontaktdaten, die der Verein bei nuLiga hinterlegt hat.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const BLACKLIST_DOMAINS = ["beispiel.invalid", "example.com", "example.org", "example.net", "w3.org", "liga.nu"];

export function extrahiereKontaktEmail(html: string): string | null {
  // 1. mailto:-Links zuerst (höhere Qualität — bewusst verlinkt).
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)];
  for (const m of mailtoMatches) {
    const addr = m[1].toLowerCase().trim();
    if (istGueltig(addr)) return addr;
  }

  // 2. Nackte E-Mail-Adressen im Text — aber NUR im Kontaktadresse-Abschnitt,
  //    nicht im restlichen HTML (Footer, Werbung, etc.).
  //    Suche den Abschnitt "<h2>Kontaktadresse" oder "<h2>Kontakt".
  const kontaktMatch = html.match(/<h2[^>]*>\s*(?:Kontakt|Kontaktadresse)\s*<\/h2>([\s\S]*?)(?:<\/?(?:h[1-6]|div)\b|$)/i);
  if (kontaktMatch) {
    const abschnitt = kontaktMatch[1];
    const treffer = abschnitt.match(EMAIL_RE);
    if (treffer) {
      for (const t of treffer) {
        const addr = t.toLowerCase().trim();
        if (istGueltig(addr)) return addr;
      }
    }
  }

  // 3. Fallback: gesamte Seite nach mailto: durchsuchen (schon oben gemacht).
  //    Wenn gar nichts im Kontaktabschnitt steht, return null.
  return null;
}

function istGueltig(addr: string): boolean {
  const [local, domain] = addr.split("@");
  if (!local || !domain) return false;
  const domainLower = domain.toLowerCase();
  if (BLACKLIST_DOMAINS.some((d) => domainLower === d || domainLower.endsWith(`.${d}`))) return false;
  if (local.length < 2 || local.length > 64) return false;
  if (domain.length < 3 || domain.length > 253) return false;
  return true;
}
