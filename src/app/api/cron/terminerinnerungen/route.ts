import { sendeAusstehendeErinnerungen } from "@/lib/terminerinnerungen";
import { sendeOffenePostenErinnerungen } from "@/lib/dienste-erinnerung";

// Läuft täglich per Vercel Cron (siehe vercel.json). Bündelt beide
// Erinnerungs-Mails (an Funktionsträger + an Admins bei offenen Diensten)
// im selben täglichen Lauf statt eines eigenen Cron-Eintrags — beides sind
// Benachrichtigungs-Jobs mit demselben Rhythmus.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [erinnerungen, offenePosten] = await Promise.all([
    sendeAusstehendeErinnerungen(),
    sendeOffenePostenErinnerungen(),
  ]);
  return Response.json({ erinnerungen, offenePosten });
}
