import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { passwortAendern } from "./actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";

// Bewusst auth() statt requireSession()/requireSystemAdmin(): diese Seite
// muss auch dann erreichbar sein, wenn mussPasswortAendern gesetzt ist —
// requireSession() würde sonst genau hierher zurückschicken (Schleife).
export default async function PasswortAendernPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const erzwungen = session.user.mussPasswortAendern;
  // Aus der DB statt aus der Session, da die Session (JWT) das nicht
  // enthält — nur relevant, um bei einer freiwilligen Erst-Vergabe (noch
  // gar kein Passwort gesetzt) das "bisheriges Passwort"-Feld auszulassen.
  const nutzer = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { passwordHash: true },
  });
  const bisherigesPasswortNoetig = !erzwungen && !!nutzer?.passwordHash;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-1 size-10 text-primary" />
          <CardTitle className="text-xl">Passwort ändern</CardTitle>
          <CardDescription>
            {erzwungen
              ? "Du hast dich mit einem Einmal-Passwort angemeldet — bitte vergib jetzt ein eigenes Passwort."
              : "Vergib ein neues Passwort für den Login."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={passwortAendern} className="flex flex-col gap-4">
            {bisherigesPasswortNoetig && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="bisherigesPasswort">Bisheriges Passwort</Label>
                <Input
                  id="bisherigesPasswort"
                  name="bisherigesPasswort"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="neuesPasswort">Neues Passwort</Label>
              <Input
                id="neuesPasswort"
                name="neuesPasswort"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="neuesPasswortWiederholung">
                Neues Passwort wiederholen
              </Label>
              <Input
                id="neuesPasswortWiederholung"
                name="neuesPasswortWiederholung"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <SubmitButton className="w-full" pendingText="Wird gespeichert…">
              Passwort speichern
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
