"use server";

import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { adminDb } from "@/db/admin";
import { vereine } from "@/db/schema";
import type { MehrfachEintragErgebnis } from "@/components/mehrfachauswahl";
import { ZEITNEHMER_ROLLEN } from "@/lib/eintragung-termine";
import { ORDNER_ROLLEN } from "@/lib/ordnerwart";
import {
  zeitnehmerSelbstEintragenMehrfachEingeloggt,
  zeitnehmerSelbstEintragenMehrfachOeffentlich,
} from "../../zeitnehmer-eintragen/[token]/actions";
import {
  ordnerSelbstEintragenMehrfachEingeloggt,
  ordnerSelbstEintragenMehrfachOeffentlich,
} from "../../ordner-eintragen/[token]/actions";

const TOKEN_FORMAT = /^[A-Za-z0-9_-]+$/;

// EINE Absende-Aktion für die gemeinsame Eintragungsseite: die Auswahl ("terminId|rolle") wird nach Rolle gruppiert und je Gruppe an die
// bestehende, ausführlich begründete Logik (Namensabgleich, Konto per E-Mail, Bestätigungs-Mails, Bedarfsprüfung) der beiden früheren
// Seiten übergeben — jeweils mit dem Token DIESER Gruppe (das Token der Wart-Freischaltung ist die Berechtigung). Ob die Person eingeloggt
// ist, entscheidet der Server aus der Session (nicht der Client). Die Gruppen laufen nacheinander, damit ein dabei angelegtes Konto
// beim zweiten Durchlauf schon gefunden wird.
export async function eintragenMehrfach(formData: FormData): Promise<MehrfachEintragErgebnis> {
  const token = formData.get("token");
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return { eingetragen: 0, gesamt: 0, fehler: "Ungültiger Link." };

  const auswahl = formData.getAll("auswahl").filter((v): v is string => typeof v === "string" && v.includes("|"));
  if (auswahl.length === 0) return { eingetragen: 0, gesamt: 0, fehler: "Bitte mindestens einen Termin auswählen." };

  const verein = await adminDb.query.vereine.findFirst({
    where: or(eq(vereine.zeitnehmerSelbstanmeldungToken, token), eq(vereine.ordnerSelbstanmeldungToken, token)),
  });
  if (!verein) return { eingetragen: 0, gesamt: auswahl.length, fehler: "Ungültiger oder nicht mehr aktiver Link." };

  const session = await auth();
  const eingeloggt = session?.user?.vereinId === verein.id;

  const nachRolle = new Map<string, string[]>();
  for (const eintrag of auswahl) {
    const [terminId, rolle] = eintrag.split("|");
    nachRolle.set(rolle, [...(nachRolle.get(rolle) ?? []), terminId]);
  }

  let eingetragen = 0;
  const fehler: string[] = [];
  const warnungen: string[] = [];
  for (const [rolle, terminIds] of nachRolle) {
    const istZeitnehmer = (ZEITNEHMER_ROLLEN as readonly string[]).includes(rolle);
    const istOrdner = (ORDNER_ROLLEN as readonly string[]).includes(rolle);
    const gruppenToken = istZeitnehmer ? verein.zeitnehmerSelbstanmeldungToken : istOrdner ? verein.ordnerSelbstanmeldungToken : null;
    if (!gruppenToken) {
      fehler.push("Diese Eintragung ist für den Verein nicht freigeschaltet.");
      continue;
    }
    const fd = new FormData();
    fd.set("token", gruppenToken);
    fd.set("rolle", rolle);
    for (const feld of ["name", "email"]) {
      const wert = formData.get(feld);
      if (typeof wert === "string") fd.set(feld, wert);
    }
    for (const id of terminIds) fd.append("terminIds", id);
    const aktion = istZeitnehmer
      ? eingeloggt
        ? zeitnehmerSelbstEintragenMehrfachEingeloggt
        : zeitnehmerSelbstEintragenMehrfachOeffentlich
      : eingeloggt
        ? ordnerSelbstEintragenMehrfachEingeloggt
        : ordnerSelbstEintragenMehrfachOeffentlich;
    const ergebnis = await aktion(fd);
    eingetragen += ergebnis.eingetragen;
    if (ergebnis.fehler) fehler.push(ergebnis.fehler);
    if (ergebnis.warnung) warnungen.push(ergebnis.warnung);
  }

  revalidatePath(`/eintragen/${token}`);
  return {
    eingetragen,
    gesamt: auswahl.length,
    fehler: fehler.length ? fehler.join(" | ") : null,
    warnung: warnungen.length ? warnungen.join(" | ") : null,
  };
}

// Login-Link direkt auf der Eintragungsseite anfordern: nach dem Klick auf den Link in der Mail landet die Person wieder HIER, erkannt und
// ohne Namensabfrage (siehe eingeloggtAls). Wie auf /login: nur ein interner Pfad als Ziel, Fehler von Auth.js als Weiterleitung.
export async function loginLinkAnfordern(formData: FormData) {
  const email = formData.get("email");
  const token = formData.get("token");
  if (typeof email !== "string" || !email.trim() || typeof token !== "string" || !TOKEN_FORMAT.test(token)) return;
  try {
    await signIn("nodemailer", { email: email.trim(), redirectTo: `/eintragen/${token}` });
  } catch (err) {
    if (err instanceof AuthError) redirect(`/login?error=${err.type}`);
    throw err;
  }
}
