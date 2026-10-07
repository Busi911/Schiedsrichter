import { pruefeCronSecret } from "@/lib/cron-auth";
import { pruefeZahlungen } from "@/lib/zahlung-erinnerung";

export const maxDuration = 60;

// Täglich: Zahlungsperioden prüfen. Informiert die Systemadmins (und den Verein) einmal je Stufe: Periode/Frist läuft in ≤ 30 Tagen ab, überfällig, gesperrt.
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;
  return Response.json(await pruefeZahlungen());
}
