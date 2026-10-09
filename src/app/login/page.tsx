import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { Logo } from "@/components/logo";
import { ModusButton } from "@/components/modus-button";

const FEHLER_TEXT: Record<string, string> = {
  CredentialsSignin: "E-Mail oder Passwort falsch.",
};

// Nur ein einzelner, verein-interner Pfad ("/xyz", nicht "//evil.com" oder
// "https://…") ist als Redirect-Ziel erlaubt — sonst ließe sich der Login
// als offener Redirector für beliebige externe URLs missbrauchen.
function sichererRedirect(ziel: string | undefined): string {
  if (ziel && ziel.startsWith("/") && !ziel.startsWith("//")) {
    return ziel;
  }
  return "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; passwortGeaendert?: string; redirect?: string }>;
}) {
  const { error, passwortGeaendert, redirect: redirectParam } = await searchParams;
  const redirectTo = sichererRedirect(redirectParam);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      {/* /login hat (anders als fast jede andere Seite) keinen
          umschließenden Header — ohne diesen Link gäbe es keine Möglichkeit,
          von hier aus zurück auf die Startseite zu kommen außer über den
          Browser-Zurück-Button. */}
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-base text-muted-foreground underline"
        >
          ← Zur Startseite
        </Link>
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-1 text-center">
        <Logo className="mb-1 size-16 text-primary" />
        <h1 className="text-2xl font-semibold">Login</h1>
      </div>

      {passwortGeaendert && (
        <p className="w-full max-w-sm rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-700 dark:text-emerald-400">
          Passwort geändert — meldet euch damit neu an.
        </p>
      )}
      {error && (
        <p className="w-full max-w-sm rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {FEHLER_TEXT[error] ?? "Login fehlgeschlagen."}
        </p>
      )}

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Einloggen</CardTitle>
          <CardDescription>
            Mit Passwort — oder ganz ohne: Wir schicken euch auf Wunsch einen Login-Link per E-Mail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* EIN Formular für beide Wege: die E-Mail-Adresse muss nur einmal eingegeben werden. "Einloggen" (Standard-Absenden) nutzt das
              Passwort, die beiden formAction-Buttons schicken stattdessen einen Link (Login bzw. Passwort zurücksetzen). */}
          <form
            action={async (formData) => {
              "use server";
              // Auth.js leitet bei falschen Zugangsdaten NUR dann automatisch
              // mit ?error=... um, wenn es selbst die Route bedient
              // (eingebautes /api/auth/signin) — hier wird signIn() aber aus
              // einer eigenen Server Action heraus aufgerufen, dafür wirft
              // Auth.js den Fehler stattdessen (siehe Doku-Kommentar zu
              // CredentialsSignin in @auth/core/errors.d.ts, Fall 2). Ohne
              // diesen Fang landete ein falsches Passwort bisher als harter
              // 500/Server-Fehler statt als die unten vorgesehene Meldung.
              try {
                await signIn("credentials", {
                  email: formData.get("email"),
                  password: formData.get("password"),
                  redirectTo,
                });
              } catch (err) {
                if (err instanceof AuthError) {
                  redirect(`/login?error=${err.type}`);
                }
                throw err;
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email" className="text-base">
                E-Mail-Adresse
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@verein.de"
                autoComplete="email"
                className="h-12 px-3"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-base">
                Passwort
              </Label>
              <PasswordInput id="password" name="password" autoComplete="current-password" className="h-12 px-3 pr-12" />
            </div>
            {/* Das Passwort-Feld ist bewusst NICHT required, sonst würde die Browser-Validierung auch die Link-Buttons blockieren,
                obwohl sie kein Passwort brauchen. Ein leeres Passwort führt beim normalen Login serverseitig ohnehin nur zu
                "falsches Passwort" (siehe authorize() in auth.ts), kein Absturz. Das E-Mail-Feld bleibt für alle Buttons required. */}
            <ModusButton className="h-12 w-full text-base" pendingText="Wird geprüft…">
              Einloggen
            </ModusButton>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              oder ohne Passwort
              <div className="h-px flex-1 bg-border" />
            </div>

            <ModusButton
              variant="outline"
              className="h-12 w-full text-base"
              pendingText="Wird gesendet…"
              formAction={async (formData) => {
                "use server";
                const email = formData.get("email");
                if (typeof email !== "string" || !email) return;
                try {
                  await signIn("nodemailer", { email, redirectTo });
                } catch (err) {
                  if (err instanceof AuthError) {
                    redirect(`/login?error=${err.type}`);
                  }
                  throw err;
                }
              }}
            >
              Login-Link per E-Mail senden
            </ModusButton>
            <ModusButton
              variant="ghost"
              className="h-12 w-full text-base text-muted-foreground"
              pendingText="Wird gesendet…"
              formAction={async (formData) => {
                "use server";
                const email = formData.get("email");
                if (typeof email !== "string" || !email) return;
                try {
                  await signIn("nodemailer", {
                    email,
                    redirectTo: "/profil/passwort-aendern",
                  });
                } catch (err) {
                  if (err instanceof AuthError) {
                    redirect(`/login?error=${err.type}`);
                  }
                  throw err;
                }
              }}
            >
              Passwort vergessen?
            </ModusButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
