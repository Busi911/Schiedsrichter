import "server-only";

// Impressum-Scraper: Lädt die Website eines Vereins, findet die Impressum-Seite
// und extrahiert die E-Mail-Adresse daraus. Das Impressum ist eine öffentliche
// Pflichtangabe (§ 5 TMG / § 55 RStV) — die E-Mail-Adresse daraus für die
// Kontaktaufnahme ist ein berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).
//
// Bewusst robust und defensiv: nie werfen, immer null zurückgeben bei Misserfolg.
// Der Aufrufer (Outreach-Cron) protokolliert den Ausgang.

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 500_000;
const USER_AGENT = "Handballerpate/1.0 (Vereins-Outreach; Impressum)";

// Häufige Pfade für Impressumseiten — der Scraper versucht nacheinander.
const IMPRESSUM_PFADE = [
  "/impressum",
  "/impressum.html",
  "/kontakt",
  "/kontakt.html",
  "/about",
  "/ueber-uns",
  "/datenschutz", // Fallback: oft auch dort die Kontakt-E-Mail
];

// E-Mail-Regex: practical, nicht RFC-streng. Erkennt mailto:-Links und
// nackte Adressen im Text. Filtert offensichtliche Fälle heraus.
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Blacklist: Domains, die nie eine Vereins-E-Mail sind.
const BLACKLIST_DOMAINS = ["example.com", "example.org", "example.net", "w3.org", "schema.org"];

// Blacklist: lokale Teile, die nie ein Ansprechpartner sind.
// "info" ist NICHT enthalten — bei Vereinen ist info@verein.de häufig DIE
// Hauptkontaktadresse (§ 5 TMG Impressum). Andere generische Postfächer
// (webmaster, postmaster, …) sind technische Adressen, keine Ansprechpartner.
const BLACKLIST_LOCAL = [" Impressum", "datenschutz", "webmaster", "hostmaster", "postmaster", "noreply", "no-reply", "donotreply", "abuse", "root", "admin"];

export type ImpressumErgebnis = {
  email: string | null;
  quelle: "impressum" | "kontakt" | "homepage" | null;
  website: string | null;
  fehler: string | null;
};

export async function scrapeImpressum(website: string): Promise<ImpressumErgebnis> {
  const fehler: string[] = [];
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return { email: null, quelle: null, website: null, fehler: "Ungültige URL" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { email: null, quelle: null, website: null, fehler: "Kein http/https" };
  }

  // 1. Erst die Startseite selbst nach E-Mail durchsuchen — viele Vereine
  //    haben die Kontakt-E-Mail direkt auf der Startseite im Footer.
  try {
    const html = await ladeSeite(url.toString());
    const gefunden = extrahiereEmail(html, url.hostname);
    if (gefunden) {
      return { email: gefunden, quelle: "homepage", website: website, fehler: null };
    }
  } catch (err) {
    fehler.push(`Startseite: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Impressum und Kontaktseiten durchsuchen.
  for (const pfad of IMPRESSUM_PFADE) {
    const versuchsUrl = new URL(pfad, url).toString();
    try {
      const html = await ladeSeite(versuchsUrl);
      const gefunden = extrahiereEmail(html, url.hostname);
      if (gefunden) {
        const quelle: ImpressumErgebnis["quelle"] =
          pfad.startsWith("/impressum") ? "impressum" :
          pfad.startsWith("/kontakt") ? "kontakt" :
          pfad.startsWith("/datenschutz") ? "kontakt" : "kontakt";
        return { email: gefunden, quelle, website: versuchsUrl, fehler: null };
      }
    } catch (err) {
      fehler.push(`${pfad}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    email: null,
    quelle: null,
    website: website,
    fehler: fehler.length ? fehler.join("; ") : "Keine E-Mail gefunden",
  };
}

async function ladeSeite(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9",
      },
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // Nicht mehr als MAX_BYTES lesen — Schutz gegen riesige Seiten.
    const reader = response.body?.getReader();
    if (!reader) return await response.text();
    const teile: Uint8Array[] = [];
    let summe = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      summe += value.length;
      if (summe > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      teile.push(value);
    }
    return Buffer.concat(teile).toString("utf8");
  } finally {
    clearTimeout(timeout);
  }
}

function extrahiereEmail(html: string, hostname: string): string | null {
  // mailto:-Links zuerst (höhere Qualität — vom Autor bewusst verlinkt).
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)];
  for (const m of mailtoMatches) {
    const addr = m[1].toLowerCase().trim();
    if (istGueltig(addr, hostname)) return addr;
  }

  // Nackte E-Mail-Adressen im Text.
  const treffer = html.match(EMAIL_RE);
  if (treffer) {
    // Nach Häufigkeit sortieren — die häufigste E-Mail ist wahrscheinlich die Hauptkontaktadresse.
    const haeufigkeit = new Map<string, number>();
    for (const t of treffer) {
      const addr = t.toLowerCase().trim();
      if (istGueltig(addr, hostname)) {
        haeufigkeit.set(addr, (haeufigkeit.get(addr) ?? 0) + 1);
      }
    }
    if (haeufigkeit.size > 0) {
      const sortiert = [...haeufigkeit.entries()].sort((a, b) => b[1] - a[1]);
      return sortiert[0][0];
    }
  }

  return null;
}

function istGueltig(addr: string, hostname: string): boolean {
  const [local, domain] = addr.split("@");
  if (!local || !domain) return false;
  // Domain-Blacklist.
  const domainLower = domain.toLowerCase();
  if (BLACKLIST_DOMAINS.some((d) => domainLower === d || domainLower.endsWith(`.${d}`))) return false;
  // Local-Blacklist: info@, Impressum@, datenschutz@ etc. sind oft keine
  // echte Ansprechpartner-E-Mail, sondern ein generisches Postfach.
  // ABER: info@ ist bei Vereinen häufig DIE Hauptkontaktadresse — deshalb
  // Info nur aussortieren, wenn es die Domain der Website selbst ist.
  if (BLACKLIST_LOCAL.some((b) => local === b.trim().toLowerCase())) return false;
  // Keine Adressen, die die Domain der Website enthalten (info@meinverein.de ist OK,
  // aber Impressum@meinverein.de nicht — das steht im Markup als Label, nicht als Mail).
  if (local.length < 2 || local.length > 64) return false;
  if (domain.length < 3 || domain.length > 253) return false;
  return true;
}

// Für den Outreach-Cron: alle Vereine aus dem nuLiga-Index, die noch nicht
// in der App existieren, als Kandidatenliste zurückgeben.
export type OutreachKandidat = {
  clubId: string;
  name: string;
  bezirk: string | null;
  website: string | null;
};
