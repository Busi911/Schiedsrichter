import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { withTenant } from "@/db";
import { funktionstraegerRollen, users, vereine } from "@/db/schema";
import { sendMail } from "./mailer";
import { emailAlsHtml, emailAlsText, type EmailInhalt } from "./email-layout";
import { formatDatum } from "./format";
import { appUrl } from "./app-url";
import { LIZENZ_ROLLEN, type LizenzRolle } from "./lizenz-rollen";
import { gruppiereLizenzRollen } from "./funktionstraeger-rollen";

export { LIZENZ_ROLLEN };

const TYP_LABEL: Record<LizenzRolle, string> = {
  schiedsrichter: "Schiedsrichter",
  zeitnehmer: "Zeitnehmer",
  sekretaer: "Sekretär",
};

type Stufe = "60_tage" | "30_tage" | "7_tage" | "abgelaufen";
// Reihenfolge = Dringlichkeit — nur ein Übergang zu einer HÖHEREN Stufe löst
// eine neue Mail aus (siehe sendeLizenzAblaufErinnerungen unten), damit ein
// täglicher Cron-Lauf nicht jeden Tag innerhalb desselben Fensters erneut
// verschickt, ein übersprungener Tag (Cron-Ausfall) aber trotzdem noch genau
// eine Mail für die dann aktuell fällige Stufe bekommt.
const STUFEN_RANG: Record<Stufe, number> = {
  "60_tage": 1,
  "30_tage": 2,
  "7_tage": 3,
  abgelaufen: 4,
};

function ermittleStufe(tageBisAblauf: number): Stufe | null {
  if (tageBisAblauf < 0) return "abgelaufen";
  if (tageBisAblauf <= 7) return "7_tage";
  if (tageBisAblauf <= 30) return "30_tage";
  if (tageBisAblauf <= 60) return "60_tage";
  return null;
}

function stufenText(stufe: Stufe, gueltigBis: Date): string {
  if (stufe === "abgelaufen") {
    return `ist seit dem ${formatDatum(gueltigBis)} abgelaufen`;
  }
  return `läuft am ${formatDatum(gueltigBis)} ab`;
}

export function lizenzAblaufPersonInhalt(
  vereinName: string,
  rolleLabel: string,
  stufe: Stufe,
  gueltigBis: Date
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `Deine ${rolleLabel}-Lizenz ${stufenText(stufe, gueltigBis)}.`,
    zeilen: [
      "Bitte kümmere dich rechtzeitig um eine Verlängerung bzw. informiere deinen Verein, falls das bereits läuft.",
    ],
  };
}

export function lizenzAblaufAdminInhalt(
  vereinName: string,
  personName: string,
  rolleLabel: string,
  stufe: Stufe,
  gueltigBis: Date
): EmailInhalt {
  return {
    vereinName,
    ueberschrift: `Die ${rolleLabel}-Lizenz von ${personName} ${stufenText(stufe, gueltigBis)}.`,
    zeilen: [],
    cta: { text: "Zur Funktionsträger-Verwaltung", url: `${appUrl()}/admin/funktionstraeger` },
  };
}

const vereinCache = new Map<string, { name: string; adminEmails: string[] }>();
async function holeVereinInfo(vereinId: string) {
  const gecacht = vereinCache.get(vereinId);
  if (gecacht) return gecacht;
  const [verein, admins] = await Promise.all([
    adminDb.query.vereine.findFirst({ where: eq(vereine.id, vereinId) }),
    adminDb
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.vereinId, vereinId), eq(users.istAdmin, true))),
  ]);
  const info = {
    name: verein?.name ?? "HandballerPate",
    adminEmails: admins.map((a) => a.email),
  };
  vereinCache.set(vereinId, info);
  return info;
}

// Täglicher Digest (siehe api/cron/terminerinnerungen) — informiert die
// Person selbst UND alle Vereins-Admins gestaffelt 60/30/7 Tage vor Ablauf
// einer Schiedsrichter-/Zeitnehmer-/Sekretär-Lizenz sowie einmalig nach
// Ablauf. Dedup über lizenzErinnerungStufe (siehe STUFEN_RANG oben) statt
// einer generischen benachrichtigung-Zeile wie in terminerinnerungen.ts, da
// diese Erinnerung an einer Rolle statt an einem Termin hängt.
export async function sendeLizenzAblaufErinnerungen() {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);

  const rollen = await adminDb
    .select({
      rolleId: funktionstraegerRollen.id,
      userId: users.id,
      typ: funktionstraegerRollen.typ,
      gueltigBis: funktionstraegerRollen.lizenzGueltigBis,
      stufeBisher: funktionstraegerRollen.lizenzErinnerungStufe,
      userName: users.name,
      userEmail: users.email,
      vereinId: users.vereinId,
    })
    .from(funktionstraegerRollen)
    .innerJoin(users, eq(funktionstraegerRollen.userId, users.id))
    .where(
      and(
        eq(funktionstraegerRollen.aktiv, true),
        isNotNull(funktionstraegerRollen.lizenzGueltigBis),
        inArray(funktionstraegerRollen.typ, LIZENZ_ROLLEN)
      )
    );

  // Zeitnehmer und Sekretär sind EINE Funktion mit gemeinsamer Lizenz: eine Erinnerung statt zwei (siehe gruppiereLizenzRollen).
  const einheiten = gruppiereLizenzRollen(rollen, TYP_LABEL, STUFEN_RANG);

  let versendet = 0;
  const fehler: { rolleId: string; message: string }[] = [];

  for (const r of einheiten) {
    if (!r.gueltigBis || !r.vereinId) continue;
    const tageBisAblauf = Math.round(
      (r.gueltigBis.getTime() - heute.getTime()) / (24 * 60 * 60 * 1000)
    );
    const stufe = ermittleStufe(tageBisAblauf);
    if (!stufe) continue;
    if (r.stufeBisher && STUFEN_RANG[r.stufeBisher as Stufe] >= STUFEN_RANG[stufe]) {
      continue;
    }

    try {
      const { name: vereinName, adminEmails } = await holeVereinInfo(r.vereinId);
      const rolleLabel = r.label;

      const personInhalt = lizenzAblaufPersonInhalt(vereinName, rolleLabel, stufe, r.gueltigBis);
      await sendMail(
        r.userEmail,
        `${rolleLabel}-Lizenz ${stufe === "abgelaufen" ? "abgelaufen" : "läuft bald ab"}`,
        emailAlsText(personInhalt),
        emailAlsHtml(personInhalt)
      );

      for (const adminEmail of adminEmails) {
        const adminInhalt = lizenzAblaufAdminInhalt(
          vereinName,
          r.userName ?? r.userEmail,
          rolleLabel,
          stufe,
          r.gueltigBis
        );
        await sendMail(
          adminEmail,
          `${rolleLabel}-Lizenz von ${r.userName ?? r.userEmail} ${stufe === "abgelaufen" ? "abgelaufen" : "läuft bald ab"}`,
          emailAlsText(adminInhalt),
          emailAlsHtml(adminInhalt)
        );
      }

      await withTenant(r.vereinId, (tx) =>
        tx
          .update(funktionstraegerRollen)
          .set({ lizenzErinnerungStufe: stufe })
          .where(inArray(funktionstraegerRollen.id, r.rolleIds))
      );
      versendet++;
    } catch (err) {
      fehler.push({
        rolleId: r.rolleId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { geprueft: rollen.length, versendet, fehler };
}
