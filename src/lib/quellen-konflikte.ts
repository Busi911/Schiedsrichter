import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { ligaGruppen, ligaMannschaften, ligaTeilnahmen, ligaVereine } from "@/db/schema";
import { findeQuellenKonflikte, type QuellenZeile } from "./quellen-konflikte-rechnung";

// Nur lesend: aktive Teilnahmen (ohne Freundschaftsspiele) aller Vereine mit Mannschaft, Gruppe und Quelle — Grundlage der Konfliktliste in
// /system/abgleich (Dubletten zwischen nuLiga und handball.net).
export async function holeQuellenKonflikte() {
  const zeilen: QuellenZeile[] = await adminDb
    .select({
      ligaVereinId: ligaVereine.id,
      vereinName: ligaVereine.name,
      mannschaftId: ligaMannschaften.id,
      schluessel: ligaMannschaften.schluessel,
      mannschaftName: ligaMannschaften.name,
      kategorie: ligaMannschaften.kategorie,
      geschlecht: ligaMannschaften.geschlecht,
      altersklasse: ligaMannschaften.altersklasse,
      nummer: ligaMannschaften.nummer,
      saison: ligaTeilnahmen.saison,
      quelle: ligaGruppen.quelle,
      ligaName: ligaGruppen.ligaName,
    })
    .from(ligaTeilnahmen)
    .innerJoin(ligaMannschaften, eq(ligaMannschaften.id, ligaTeilnahmen.mannschaftId))
    .innerJoin(ligaGruppen, eq(ligaGruppen.id, ligaTeilnahmen.gruppeId))
    .innerJoin(ligaVereine, eq(ligaVereine.id, ligaMannschaften.ligaVereinId))
    .where(and(eq(ligaTeilnahmen.aktiv, true), eq(ligaMannschaften.aktiv, true), eq(ligaGruppen.istFreundschaft, false)));
  return findeQuellenKonflikte(zeilen);
}
