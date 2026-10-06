// Hilfen für Quellen ohne eigene Team-IDs (ndr.de): stabiler Schlüssel aus dem Namen.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Ohne Team-ID der Quelle: stabiler Ersatzschlüssel aus dem Namen (mit Präfix, damit er als solcher erkennbar bleibt).
export const teamIdAusNamen = (name: string) => `name:${slugify(name)}`;
