import "server-only";

// Basis-URL für Links in E-Mails. APP_URL kann explizit gesetzt werden,
// sonst wird die von Vercel automatisch bereitgestellte Produktions-Domain
// verwendet, sonst lokal http://localhost:3000.
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
