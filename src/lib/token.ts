// Wandelt einen Vereinsnamen in ein URL-sicheres Präfix um (z.B.
// "TSF Heuchelheim" -> "tsf-heuchelheim") — deutsche Umlaute werden dabei
// transliteriert statt nur die Akzente zu entfernen (ä -> ae statt a),
// sonst gingen Wortbestandteile verloren/unleserlich.
function slugifiziereVereinsname(name: string): string {
  const transliteriert = name
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
  const slug = transliteriert
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // übrige Akzente (é, à, …)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Lange Vereinsnamen nicht endlos in die URL ziehen.
  return slug.slice(0, 30).replace(/-+$/g, "");
}

// Öffentliche Token für Selbsteintragung/Turnier-Ansicht (Kenntnis des
// Tokens ist die Berechtigung, siehe jeweilige Kommentare an den
// Aufrufstellen) — mit dem Vereinsnamen als lesbarem Präfix statt einer
// nichtssagenden UUID, damit der Link nicht "utopisch lang und kryptisch"
// wirkt (siehe Nutzer-Feedback). Der Zufallsteil (16 Hex-Zeichen, 64 Bit)
// bleibt praktisch unerratbar — für einen per Link geteilten Vereins-Zugang
// (kein Login-Passwort) ist das mehr als ausreichend, auch wenn es kürzer
// ist als eine volle UUID (122 Bit): Lesbarkeit ist hier der Engpass, nicht
// Sicherheit.
export function generiereOeffentlichenToken(vereinName: string): string {
  const slug = slugifiziereVereinsname(vereinName);
  const zufall = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return slug ? `${slug}-${zufall}` : zufall;
}
