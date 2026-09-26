import Link from "next/link";
import { eq } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { users } from "@/db/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmailBestaetigenFormular } from "./formular";

function istAbgelaufen(ablaufAm: Date | null): boolean {
  return !ablaufAm || ablaufAm.getTime() < Date.now();
}

// Zeigt vor der eigentlichen Änderung erst einen Zwischenschritt mit
// explizitem Bestätigen-Klick, statt den Link direkt beim Aufruf (GET)
// wirksam werden zu lassen — E-Mail-Scanner/Virenschutz-Proxies (z.B.
// Microsoft SafeLinks) rufen Links in Mails teils automatisch vorab ab,
// was den Token sonst verbrauchen könnte, bevor die Person selbst klickt.
export default async function EmailBestaetigenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await adminDb.query.users.findFirst({
    where: eq(users.pendingEmailToken, token),
  });

  const abgelaufen = istAbgelaufen(user?.pendingEmailTokenAblaufAm ?? null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>E-Mail-Adresse bestätigen</CardTitle>
          {user?.pendingEmail && !abgelaufen && (
            <CardDescription>
              Du kannst dich künftig mit <strong>{user.pendingEmail}</strong>{" "}
              einloggen. Bestätige, um die Änderung zu übernehmen.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!user || !user.pendingEmail || abgelaufen ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Dieser Bestätigungslink ist ungültig oder abgelaufen. Bitte
                fordere die Änderung über dein Profil erneut an.
              </p>
              <Button render={<Link href="/profil" />} nativeButton={false}>
                Zu meinem Profil
              </Button>
            </div>
          ) : (
            <EmailBestaetigenFormular token={token} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
