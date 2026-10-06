import type { SyncProfil } from "../sportde/sync";
import { parseNdrSpieltag } from "./parser";
import { spieltagPfad, vollUrl } from "./urls";

export const NDR_QUELLE = "ndr";
export const NDR_VERBAND = "NDR";

// Sync-Profil der Quelle ndr.de (siehe sportde/sync.ts: derselbe Sync für alle Spieltagsseiten-Quellen). Die Seitenadresse hängt von der Saison ab
// (2. HBL: Jahre in der Adresse), deshalb wird das Profil je Saison gebaut.
export function ndrSyncProfil(saisonStart: number): SyncProfil {
  return {
    quelle: NDR_QUELLE,
    verband: NDR_VERBAND,
    spieltagPfad: (liga, spieltag) => spieltagPfad(liga, spieltag, saisonStart),
    vollUrl,
    parse: (html, k) => ({ ...parseNdrSpieltag(html, k), }),
  };
}
