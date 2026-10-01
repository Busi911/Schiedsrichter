import { MEINE_MANNSCHAFTEN_MANIFEST } from "@/lib/liga-pwa";

export function GET() {
  return Response.json(MEINE_MANNSCHAFTEN_MANIFEST, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}
