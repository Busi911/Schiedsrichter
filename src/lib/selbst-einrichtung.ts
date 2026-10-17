// Eingabeprüfung des Einrichtungs-Assistenten für neue Vereine (/admin/einrichtung). Rein, getestet.

export const EINRICHTUNG_UEBERSPRUNGEN_COOKIE = "hp_einrichtung_uebersprungen";

// "nuliga" = Mannschaften stehen bei nuLiga, "handball_net" = bei handball.net, "beide" = beides oder unbekannt:
// dann dürfen beide IDs (oder auch nur eine) angegeben werden, der Sync nimmt, was er findet.
export type EinrichtungsQuelle = "nuliga" | "handball_net" | "beide";

export type EinrichtungsEingabe = { nuligaClubId: string | null; handballNetClubId: string | null };

export function pruefeEinrichtungsEingabe(roh: {
  quelle: string;
  nuligaClubId: string;
  handballNetClubId: string;
}): EinrichtungsEingabe | { fehler: string } {
  const quelle: EinrichtungsQuelle = roh.quelle === "nuliga" || roh.quelle === "handball_net" ? roh.quelle : "beide";
  const nuliga = quelle === "handball_net" ? "" : roh.nuligaClubId.trim();
  const hnet = quelle === "nuliga" ? "" : roh.handballNetClubId.trim();
  if (nuliga && !/^\d{1,10}$/.test(nuliga)) return { fehler: "Die nuLiga-Vereins-ID besteht nur aus Ziffern (z.B. 69723)." };
  if (hnet && !/^[a-z0-9]{3,20}$/i.test(hnet)) return { fehler: "Die handball.net-Vereins-ID besteht aus Buchstaben und Ziffern (z.B. 0b8y490)." };
  if (!nuliga && !hnet) {
    return {
      fehler:
        quelle === "nuliga"
          ? "Bitte euren Verein in der Liste wählen oder die nuLiga-Vereins-ID eintragen."
          : quelle === "handball_net"
            ? "Bitte die handball.net-Vereins-ID eintragen."
            : "Bitte mindestens eine Vereins-ID (nuLiga oder handball.net) angeben.",
    };
  }
  return { nuligaClubId: nuliga || null, handballNetClubId: hnet || null };
}

// Soll die Übersicht den Admin in den Assistenten leiten? Nur wenn noch kein Spielplan angebunden ist, nicht übersprungen,
// nicht im Demo und nicht für einen Systemadmin im Treuhand-/Support-Kontext.
export function sollEinrichtungsAssistentZeigen(s: {
  spielplanAngebunden: boolean;
  uebersprungen: boolean;
  istDemo: boolean;
  treuhand: boolean;
  istAdmin: boolean;
}): boolean {
  return s.istAdmin && !s.spielplanAngebunden && !s.uebersprungen && !s.istDemo && !s.treuhand;
}
