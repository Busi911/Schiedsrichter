// Regel für die Admin-Hinweise (Schalter `users.admin_hinweise_aktiviert`): In jedem Verein muss mindestens ein voller Admin sie aktiv haben,
// sonst käme z.B. ein neuer Beitrittsantrag bei niemandem an (Betreiber 18.10.2026). Wer als Letzter übrig ist, kann sie nicht abschalten;
// gibt es zwei Admins, kann also nur einer von beiden abschalten. Rein, ohne Datenbank.
export function abschaltenErlaubt(opt: { istVollerAdmin: boolean; istAktiv: boolean; andereAktiveAdmins: number }): boolean {
  // Wer keine Hinweise bekommt (nicht aktiv) oder kein voller Admin ist, schaltet nichts ab, was jemand anderem fehlen würde.
  if (!opt.istVollerAdmin || !opt.istAktiv) return true;
  return opt.andereAktiveAdmins > 0;
}

export const ABSCHALTEN_GESPERRT_TEXT =
  "Du bist der einzige Admin, der diese Hinweise bekommt. Mindestens ein Admin im Verein muss sie aktiv haben (z.B. für neue Beitrittsanträge). Schalte sie zuerst bei einer anderen Person ein.";
