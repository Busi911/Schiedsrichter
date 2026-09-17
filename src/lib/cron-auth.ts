import "server-only";

// Alle Vercel-Cron-Routen (siehe vercel.json) prüfen denselben Header —
// zentral statt viermal dupliziert, damit eine künftige Änderung (z.B. ein
// zusätzlicher erlaubter Header) nicht an einer Stelle vergessen wird.
// Gibt bei fehlendem/falschem Secret die fertige 401-Response zurück, sonst
// null — Aufrufer geben die Response direkt weiter.
export function pruefeCronSecret(request: Request): Response | null {
  const authHeader = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
