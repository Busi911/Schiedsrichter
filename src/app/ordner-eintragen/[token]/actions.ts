"use server";

import { vereine } from "@/db/schema";
import {
  holeOrdnerEinsatzZahlen,
  holeOrdnerwarteEmails,
  ORDNER_ROLLEN,
  pruefeKeineOrdnerDoppelrolle,
  pruefeOrdnerBesetzungsgrenze,
} from "@/lib/ordnerwart";
import {
  selbstEintragenMehrfachEingeloggt,
  selbstEintragenMehrfachOeffentlich,
  type SelbsteintragungBereich,
} from "@/lib/selbsteintragung";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";

type OrdnerRolle = (typeof ORDNER_ROLLEN)[number];

// Die Logik steckt in lib/selbsteintragung.ts (gemeinsam mit dem Zeitnehmer-Bereich). Hier nur, was sich unterscheidet: Rollen, Token, Prüfungen.
// Ordner/Kioskdienst/Kassierer: Besetzungsgrenze = konfigurierter Bedarf, Doppelrolle über andere Ordner-Rollen nur als Warnung.
const BEREICH: SelbsteintragungBereich = {
  rollen: ORDNER_ROLLEN,
  tokenSpalte: vereine.ordnerSelbstanmeldungToken,
  alterPfad: "/ordner-eintragen",
  wartSeite: "/profil/ordnerwart",
  wartLabel: "Ordnerwart",
  uebersichtLabel: "Zur Ordner-/Kioskdienst-/Kassierer-Übersicht",
  holeKandidaten: holeOrdnerEinsatzZahlen,
  holeWarteEmails: holeOrdnerwarteEmails,
  pruefeBesetzung: (tx, vereinId, terminId, termin, rolle) =>
    pruefeOrdnerBesetzungsgrenze(tx, vereinId, terminId, termin, rolle as OrdnerRolle),
  pruefeDoppelrolle: (tx, terminId, person, rolle) => pruefeKeineOrdnerDoppelrolle(tx, terminId, person, rolle as OrdnerRolle),
};

export async function ordnerSelbstEintragenMehrfachOeffentlich(formData: FormData): Promise<MehrfachEintragErgebnis> {
  return selbstEintragenMehrfachOeffentlich(BEREICH, formData);
}

export async function ordnerSelbstEintragenMehrfachEingeloggt(formData: FormData): Promise<MehrfachEintragErgebnis> {
  return selbstEintragenMehrfachEingeloggt(BEREICH, formData);
}
