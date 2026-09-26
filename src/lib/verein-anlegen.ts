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
  adminEmail: string
): Promise<string> {
  const neueEmail = adminEmail.trim().toLowerCase();
  const vereinId = crypto.randomUUID();

  await withTenant(vereinId, async (tx) => {
    await pruefeEmailVerfuegbar(tx, neueEmail, "__neu__");
    await tx.insert(vereine).values({ id: vereinId, name: vereinsname.trim() });
    await tx.insert(users).values({
      email: neueEmail,
      name: adminName.trim(),
      vereinId,
      istAdmin: true,
    });
  });

  return vereinId;
}
