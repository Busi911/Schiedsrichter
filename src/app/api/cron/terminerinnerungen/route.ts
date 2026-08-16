import { sendeAusstehendeErinnerungen } from "@/lib/terminerinnerungen";
import { sendeOffenePostenErinnerungen } from "@/lib/dienste-erinnerung";
import { sendeOffeneSchiedsrichterErinnerungen } from "@/lib/schiedsrichterwart-erinnerung";

// Läuft täglich per Vercel Cron (siehe vercel.json). Bündelt alle drei
// Erinnerungs-Mails (an Funktionsträger + an Admins bei offenen Diensten +
// an Schiedsrichterwarte bei offenem Schiedsrichter-Bedarf) im selben
// täglichen Lauf statt eigener Cron-Einträge — alles Benachrichtigungs-Jobs
// mit demselben Rhythmus.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [erinnerungen, offenePosten, offeneSchiedsrichter] = await Promise.all([
    sendeAusstehendeErinnerungen(),
    sendeOffenePostenErinnerungen(),
    sendeOffeneSchiedsrichterErinnerungen(),
  ]);
  return Response.json({ erinnerungen, offenePosten, offeneSchiedsrichter });
}
