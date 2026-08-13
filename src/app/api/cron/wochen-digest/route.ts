import { sendeWochenDigests } from "@/lib/wochen-digest";

// Läuft wöchentlich (montags) per Vercel Cron (siehe vercel.json).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendeWochenDigests();
  return Response.json(result);
}
