// Kleine, abhängigkeitsfreie HTML-Helfer für die nuLiga-Parser. Wie schon in
// src/lib/nuliga-scraper.ts bewusst ohne DOM-Bibliothek und ohne CSS-Klassen
// als Anker: nuLiga liefert klassisches Tabellen-HTML, dessen Klassen sich
// ändern können — Überschriften, Spaltenköpfe und URL-Parameter sind stabiler.

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  lt: "<",
  gt: ">",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  ndash: "–",
};

export function dekodiereEntities(wert: string): string {
  return wert.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (treffer, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : treffer;
    }
    return ENTITIES[name] ?? treffer;
  });
}

// Sichtbarer Text eines HTML-Fragments: Tags entfernt, Entities dekodiert,
// Leerraum (inkl. &nbsp;) zu einem Leerzeichen zusammengezogen.
export function textVon(html: string): string {
  return dekodiereEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/[\s ]+/g, " ")
    .trim();
}

// Wie textVon, behält aber <br> als Zeilenumbruch (z.B. für die dreizeilige
// <h1> der nuLiga-Seiten: Wettbewerb / Liga / Mannschaft).
export function zeilenVon(html: string): string[] {
  return dekodiereEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " "))
    .split("\n")
    .map((z) => z.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean);
}

export function attribut(tag: string, name: string): string | null {
  const treffer = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  const wert = treffer ? (treffer[2] ?? treffer[3]) : null;
  return wert === null ? null : dekodiereEntities(wert);
}

// Query-Parameter eines href/einer URL (mit oder ohne Pfad, &amp; oder &).
// URLSearchParams dekodiert '+' und %XX, wie nuLiga sie schreibt
// ("Gie%C3%9Fen+26%2F27" -> "Gießen 26/27").
export function paramsAusUrl(url: string): URLSearchParams {
  const dekodiert = dekodiereEntities(url);
  const index = dekodiert.indexOf("?");
  return new URLSearchParams(index >= 0 ? dekodiert.slice(index + 1) : dekodiert);
}

export type Zelle = { html: string; text: string; tag: "td" | "th"; oeffnung: string };

export function tabellen(html: string): string[] {
  return html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
}

export function zeilen(html: string): string[] {
  return html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
}

export function zellen(zeile: string): Zelle[] {
  return [...zeile.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((m) => ({
    tag: m[1].toLowerCase() as "td" | "th",
    oeffnung: `<${m[1]}${m[2]}>`,
    html: m[3],
    text: textVon(m[3]),
  }));
}

export function metaInhalt(html: string, name: string): string | null {
  for (const meta of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (attribut(meta, "name")?.toLowerCase() === name.toLowerCase()) {
      return attribut(meta, "content");
    }
  }
  return null;
}

export function ersteH1(html: string): string[] {
  const treffer = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return treffer ? zeilenVon(treffer[1]) : [];
}

export function normalisiereSpaltenkopf(text: string): string {
  return text.toLowerCase().replace(/[\s ]+/g, " ").trim();
}

// "33:15" -> { plus: 33, minus: 15 }
export function parseDoppelwert(text: string): { plus: number; minus: number } | null {
  const treffer = text.match(/(\d+)\s*:\s*(\d+)/);
  return treffer ? { plus: Number(treffer[1]), minus: Number(treffer[2]) } : null;
}
