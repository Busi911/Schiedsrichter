import { sendeAusstehendeErinnerungen } from "@/lib/terminerinnerungen";

// Läuft täglich per Vercel Cron (siehe vercel.json).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendeAusstehendeErinnerungen();
  return Response.json(result);
}
