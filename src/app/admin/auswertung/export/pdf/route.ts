import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import {
  AUSWERTUNG_ROLLEN,
  holeTermineFuerAuswertung,
  type AuswertungsRolle,
} from "@/lib/termin-auswertung";
import { terminAlsPdf } from "@/lib/termin-pdf";

export async function GET(request: Request) {
  const session = await auth();
  if (
    !session?.user?.vereinId ||
    (!session.user.istAdmin && !session.user.istAdminLesend)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const filter = {
    von: url.searchParams.get("von") ?? undefined,
    bis: url.searchParams.get("bis") ?? undefined,
    typ: url.searchParams.get("typ") ?? undefined,
    schiedsrichterId: url.searchParams.get("schiedsrichterId") ?? undefined,
  };

  const [termine, verein] = await Promise.all([
    holeTermineFuerAuswertung(session.user.vereinId, filter),
    adminDb.query.vereine.findFirst({ where: eq(vereine.id, session.user.vereinId) }),
  ]);
  // Angehakte Zeilen-Checkboxen auf der Auswertungsseite (siehe
  // AlleAuswaehlenCheckbox in admin/auswertung/page.tsx) — ohne jede Auswahl
  // (Standardfall) bleibt die komplette gefilterte Liste unverändert.
  const terminIds = url.searchParams.getAll("terminId");
  const termineExport = terminIds.length
    ? termine.filter((t) => terminIds.includes(t.id))
    : termine;
  // Analog zur Zeilen-Auswahl: angehakte "rolle"-Checkboxen (siehe
  // admin/auswertung/page.tsx) schränken die exportierten Spalten ein, ohne
  // jede Auswahl bleiben wie bisher alle Rollen drin (siehe terminAlsPdf).
  const rollen = url.searchParams
    .getAll("rolle")
    .filter((r): r is AuswertungsRolle =>
      (AUSWERTUNG_ROLLEN as readonly string[]).includes(r)
    );
  const pdf = await terminAlsPdf(termineExport, rollen, verein?.name);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="dienstplan.pdf"',
    },
  });
}
