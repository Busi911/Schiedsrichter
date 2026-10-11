"use server";

import { vereine } from "@/db/schema";
import { pruefeBesetzungsgrenze, pruefeKeineDoppelrolle } from "@/lib/zuordnung";
import { holeZeitnehmerEinsatzZahlen, holeZeitnehmerwarteEmails } from "@/lib/zeitnehmerwart";
import {
  selbstEintragenMehrfachEingeloggt,
  selbstEintragenMehrfachOeffentlich,
  type SelbsteintragungBereich,
} from "@/lib/selbsteintragung";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";

const ZEITNEHMER_ROLLEN = ["zeitnehmer", "sekretaer"] as const;

// Die Logik steckt in lib/selbsteintragung.ts (gemeinsam mit dem Ordner-Bereich). Hier nur, was sich unterscheidet: Rollen, Token, Prüfungen.
// Zeitnehmer/Sekretär: harte Sperre bei Doppelrolle (kein Hinweis-Fall wie bei Ordner/Kiosk/Kassierer).
const BEREICH: SelbsteintragungBereich = {
  rollen: ZEITNEHMER_ROLLEN,
  tokenSpalte: vereine.zeitnehmerSelbstanmeldungToken,
  alterPfad: "/zeitnehmer-eintragen",
  wartSeite: "/profil/zeitnehmerwart",
  wartLabel: "Zeitnehmerwart",
  uebersichtLabel: "Zur Zeitnehmer-Übersicht",
  holeKandidaten: holeZeitnehmerEinsatzZahlen,
  holeWarteEmails: holeZeitnehmerwarteEmails,
  pruefeBesetzung: (tx, vereinId, terminId, _termin, rolle) =>
    pruefeBesetzungsgrenze(tx, vereinId, terminId, rolle as (typeof ZEITNEHMER_ROLLEN)[number]),
  pruefeDoppelrolle: async (tx, terminId, person) => {
    await pruefeKeineDoppelrolle(tx, terminId, person);
    return { warnung: null };
  },
};

export async function zeitnehmerSelbstEintragenMehrfachOeffentlich(formData: FormData): Promise<MehrfachEintragErgebnis> {
  return selbstEintragenMehrfachOeffentlich(BEREICH, formData);
}

export async function zeitnehmerSelbstEintragenMehrfachEingeloggt(formData: FormData): Promise<MehrfachEintragErgebnis> {
  return selbstEintragenMehrfachEingeloggt(BEREICH, formData);
}
