import "server-only";

// Extrahiert die Kontakt-E-Mail aus der nuLiga-Vereinsseite (clubInfoDisplay).
// Die nuLiga-Seite hat einen "Kontaktadresse"-Abschnitt mit Name, Adresse,
// Telefon und (oft) einer E-Mail-Adresse. Der bestehende Parser
// (vereinsinfo.ts) ignoriert diese bewusst (DSGVO-Whitelist für die App),
// aber für den Outreach brauchen wir genau diese E-Mail.
//
// nuLiga verschleiert E-Mail-Adressen per JavaScript: encodeEmail('de', 'local', 'domain', '')
// → local@domain.de. Wir parsen diese Aufrufe zusätzlich zu mailto: und nackten Adressen.
//
// Diese Funktion ist nur für den Outreach-Cron bestimmt, nie für die App
// selbst — sie liest Kontaktdaten, die der Verein bei nuLiga hinterlegt hat.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const ENCODE_EMAIL_RE = /encodeEmail\(\s*['"]([a-zA-Z]{2,})['"]\s*,\s*['"]([a-zA-Z0-9._%+-]+)['"]\s*,\s*['"]([a-zA-Z0-9.-]+)['"]\s*,\s*['"]?[^'"]*['"]?\s*\)/gi;
const BLACKLIST_DOMAINS = ["beispiel.invalid", "example.com", "example.org", "example.net", "w3.org", "liga.nu"];

export function extrahiereKontaktEmail(html: string): string | null {
  // 1. mailto:-Links (höchste Qualität — bewusst verlinkt).
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)];
  for (const m of mailtoMatches) {
    const addr = m[1].toLowerCase().trim();
    if (istGueltig(addr)) return addr;
  }

  // 2. encodeEmail-Aufrufe (nuLiga-Spam-Schutz): encodeEmail('de', 'local', 'domain', '')
  //    → local@domain.de. Die TLD ist der erste Parameter, local-part der zweite,
  //    domain der dritte. Reihenfolge: encodeEmail(tld, local, domain, extra).
  const encodedMatches = [...html.matchAll(ENCODE_EMAIL_RE)];
  for (const m of encodedMatches) {
    const tld = m[1].toLowerCase();
    const local = m[2].toLowerCase();
    const domain = m[3].toLowerCase();
    const addr = `${local}@${domain}.${tld}`;
    if (istGueltig(addr)) return addr;
  }

  // 3. Nackte E-Mail-Adressen im Kontaktadresse-Abschnitt.
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
