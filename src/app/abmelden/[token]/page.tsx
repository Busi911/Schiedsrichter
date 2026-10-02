import type { Metadata } from "next";
import Link from "next/link";
import { ABMELDE_ARTEN, istAngemeldet, pruefeAbmeldeToken } from "@/lib/abmelden";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { abbestellen, wiederAnmelden } from "./actions";

export const metadata: Metadata = { title: "Mails abbestellen", robots: { index: false, follow: false } };

export default async function AbmeldenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const gueltig = pruefeAbmeldeToken(token);
  const angemeldet = gueltig ? await istAngemeldet(gueltig.userId, gueltig.art) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Mails abbestellen</CardTitle>
          {!gueltig || angemeldet === null ? (
            <CardDescription>
              Dieser Link ist ungültig oder abgelaufen. Du kannst deine Benachrichtigungen jederzeit unter „Profil →
              Benachrichtigungen“ einstellen.
            </CardDescription>
          ) : angemeldet ? (
            <CardDescription>
              Möchtest du {ABMELDE_ARTEN[gueltig.art]} nicht mehr per E-Mail erhalten?
            </CardDescription>
          ) : (
            <CardDescription>
              Erledigt: Du bekommst {ABMELDE_ARTEN[gueltig.art]} nicht mehr per E-Mail.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {gueltig && angemeldet === true && (
            <form action={abbestellen} className="flex flex-col gap-2">
              <input type="hidden" name="token" value={token} />
              <SubmitButton pendingText="Wird gespeichert…">Ja, abbestellen</SubmitButton>
            </form>
          )}
          {gueltig && angemeldet === false && (
            <form action={wiederAnmelden}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton variant="outline" pendingText="Wird gespeichert…">
                Doch wieder erhalten
              </SubmitButton>
            </form>
          )}
          <p className="text-xs text-muted-foreground">
            Alle Einstellungen findest du unter{" "}
            <Link href="/profil" className="underline">
              Profil → Benachrichtigungen
            </Link>
            . Mails, die für deinen Einsatz nötig sind (z.B. Verlegungen), sind davon nicht betroffen.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
