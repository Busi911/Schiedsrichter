// Reine Berechtigungsprüfung (kein DB-Zugriff), damit sie ohne Testdatenbank
// getestet werden kann — siehe src/lib/turnier-zugriff.test.ts. Ein Turnier
// darf zusätzlich zum Vereinsadmin von einem einzelnen, vom Admin explizit
// benannten Trainer (Turnierverantwortlicher) verwaltet werden — bewusst
// kein pauschales Recht für alle Trainer, sondern opt-in pro Turnier.
export function istTurnierBerechtigt(
  turnier: { turnierVerantwortlicherId: string | null },
  session: { user: { id: string; istAdmin: boolean } }
): boolean {
  return (
    session.user.istAdmin ||
    turnier.turnierVerantwortlicherId === session.user.id
  );
}
