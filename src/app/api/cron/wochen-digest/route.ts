import { sendeWochenDigests } from "@/lib/wochen-digest";
import { pruefeCronSecret } from "@/lib/cron-auth";

// Läuft wöchentlich (montags) per Vercel Cron (siehe vercel.json).
export async function GET(request: Request) {
  const unauthorized = pruefeCronSecret(request);
  if (unauthorized) return unauthorized;

  const result = await sendeWochenDigests();
  return Response.json(result);
}
