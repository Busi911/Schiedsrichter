// Nach einem Deploy kann ein offener Tab noch die alte Version laufen haben: Server Actions und JS-Dateien der alten Version gibt es dann
// nicht mehr. Ein Neuladen holt die neue Version. Rein/testbar; Erkennung über typische Meldungen (Next.js/Webpack/Turbopack, Browser).
const MUSTER = [
  /failed to find server action/i,
  /ChunkLoadError/i,
  /loading chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load chunk/i,
];

export function istVersionsFehler(fehler: unknown): boolean {
  if (!fehler) return false;
  const text = fehler instanceof Error ? `${fehler.name} ${fehler.message}` : String(fehler);
  return MUSTER.some((m) => m.test(text));
}
