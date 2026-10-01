// Reine Helfer für die vereinsbezogene Web-App (Manifest, Icon, Farbe) —
// ohne Server-/DB-Zugriff, damit sie getestet werden können.

// Stabiler Farbton (0-359) je Verein: gleicher Slug -> immer dieselbe Farbe,
// damit Seite, Theme-Color und App-Icon zusammenpassen.
export function vereinsFarbton(slug: string): number {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

// Anfangsbuchstaben für das Icon, z.B. "TSF Heuchelheim" -> "TH",
// "HSG Hungen/Lich" -> "HH". "e.V." zählt nicht mit.
export function vereinsInitialen(name: string): string {
  const woerter = name
    .replace(/\be\.?\s?v\.?\b/gi, "")
    .split(/[\s/\-–]+/)
    .filter((w) => /[A-Za-zÄÖÜäöüß]/.test(w));
  if (woerter.length === 0) return "H";
  // Erster Buchstabe des ersten Worts + erster des zweiten (bei "TSF
  // Heuchelheim" -> "TH": Rechtsform-Kürzel und Ort); bei nur einem Wort die
  // ersten zwei Buchstaben.
  const [erstes, zweites] = woerter;
  return (erstes[0] + (zweites ? zweites[0] : (erstes[1] ?? ""))).toUpperCase();
}

export function vereinsManifest(
  verein: { slug: string; name: string },
  design: { logoVersion?: number | null; farbton?: number | null } = {}
) {
  const { logoVersion, farbton } = design;
  const farbe = `hsl(${farbton ?? vereinsFarbton(verein.slug)} 55% 28%)`;
  const start = `/verein/${verein.slug}`;
  // Cache-Buster: ändert sich das Logo, laden Browser das neue Icon.
  const v = logoVersion ? `?v=${logoVersion}` : "";
  return {
    id: start,
    name: verein.name,
    // Vollständiger Name: short_name ist nur ein Vorschlag, Betriebssysteme
    // kürzen bei Bedarf selbst (mit eigener Darstellung der Kürzung).
    short_name: verein.name,
    description: `Mannschaften, Spielplan und Ergebnisse des ${verein.name}`,
    lang: "de",
    start_url: `${start}?app=1`,
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: farbe,
    icons: [
      { src: `${start}/icon/192${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${start}/icon/512${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${start}/icon/512${v}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export const MEINE_MANNSCHAFTEN_MANIFEST = {
  id: "/meine",
  name: "Meine Mannschaften",
  short_name: "Mannschaften",
  description: "Spielpläne und Ergebnisse deiner Lieblingsmannschaften",
  lang: "de",
  start_url: "/meine?app=1",
  scope: "/",
  display: "standalone",
  background_color: "#f4f4f5",
  theme_color: "#14532d",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
};
