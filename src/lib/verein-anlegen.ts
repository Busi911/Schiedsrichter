import "server-only";
import { withTenant } from "@/db";
import { users, vereine } from "@/db/schema";
import { startKonditionen } from "./abrechnung";
import { pruefeEmailVerfuegbar } from "./email-aendern";

// Gemeinsame Anlage-Logik für einen neuen Verein samt erstem (vollem)
// Admin — genutzt von /system/vereine (Systemadmin legt manuell an),
// /registrieren (Selbstregistrierung während der Beta) und
// /system/warteliste (nachträgliches Freischalten einer Warteliste-
// Anfrage). "__neu__" als ausgenommenUserId an pruefeEmailVerfuegbar: es
// gibt noch keinen echten User, der Parameter dient dort nur dazu, den
// GERADE bearbeiteten Datensatz von der Kollisionsprüfung auszunehmen —
// ein Platzhalter, der nie mit einer echten user.id übereinstimmt, prüft
// also schlicht "ist diese E-Mail irgendwo bereits vergeben".
export async function legeVereinMitAdminAn(
  vereinsname: string,
  adminName: string,
  adminEmail: string,
  // Optional (nicht bei /system/vereine bzw. der Warteliste-Freischaltung
  // abgefragt) — früher oder später für Rechnungen benötigt, daher schon
  // bei der Selbstregistrierung (siehe /registrieren) erfasst, aber auch
  // nachträglich unter /admin/einstellungen pflegbar, falls hier leer.
  adresse?: { strasse: string; plz: string; ort: string },
  // E-Mail des Verantwortlichen für die Rechnung (nach dem Beta-Ende Pflicht bei der Selbstregistrierung); ohne Angabe wird die Admin-E-Mail genutzt.
  rechnung?: { email: string; ansprechpartner?: string }
): Promise<string> {
  const neueEmail = adminEmail.trim().toLowerCase();
  const vereinId = crypto.randomUUID();
  // Tarif und erste Zahlungsfrist nach dem Zeitpunkt der Anlage: vor dem Beta-Ende Beta-Tester, danach regulär mit Zahlungsfrist (lib/abrechnung.ts).
  const konditionen = startKonditionen(new Date());

  await withTenant(vereinId, async (tx) => {
    await pruefeEmailVerfuegbar(tx, neueEmail, "__neu__");
    await tx.insert(vereine).values({
      id: vereinId,
      name: vereinsname.trim(),
      tarif: konditionen.tarif,
      zahlungFaelligAm: konditionen.zahlungFaelligAm,
      rechnungEmail: (rechnung?.email ?? adminEmail).trim().toLowerCase(),
      rechnungAnsprechpartner: (rechnung?.ansprechpartner ?? adminName).trim(),
      ...(adresse
        ? {
            strasse: adresse.strasse.trim(),
            plz: adresse.plz.trim(),
            ort: adresse.ort.trim(),
          }
        : {}),
    });
    await tx.insert(users).values({
      email: neueEmail,
      name: adminName.trim(),
      vereinId,
      istAdmin: true,
    });
  });

  return vereinId;
}
