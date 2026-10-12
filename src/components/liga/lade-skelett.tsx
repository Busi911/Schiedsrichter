// Platzhalter, solange eine Seite der öffentlichen Fan-App serverseitig geladen wird (loading.tsx): zeigt sofort die
// Struktur statt einer leeren Fläche. Ohne Animation bei "Bewegung reduzieren".
export function LadeSkelett({ zeilen = 4 }: { zeilen?: number }) {
  return (
    <div role="status" aria-label="Lädt…" className="space-y-4 pb-28 md:pb-0">
      <div className="h-6 w-40 rounded bg-muted motion-safe:animate-pulse" />
      {Array.from({ length: zeilen }, (_, i) => (
        <div key={i} className="h-24 rounded-xl bg-muted motion-safe:animate-pulse" />
      ))}
    </div>
  );
}
