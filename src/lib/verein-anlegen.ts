import "server-only";
import { withTenant } from "@/db";
import { users, vereine } from "@/db/schema";
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
  adresse?: { strasse: string; plz: string; ort: string }
): Promise<string> {
  const neueEmail = adminEmail.trim().toLowerCase();
  const vereinId = crypto.randomUUID();

  await withTenant(vereinId, async (tx) => {
    await pruefeEmailVerfuegbar(tx, neueEmail, "__neu__");
    await tx.insert(vereine).values({
      id: vereinId,
      name: vereinsname.trim(),
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
