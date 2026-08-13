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
import { SubmitButton } from "@/components/submit-button";

const FEHLER_TEXT: Record<string, string> = {
  CredentialsSignin: "E-Mail oder Passwort falsch.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; passwortGeaendert?: string }>;
}) {
  const { error, passwortGeaendert } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-1 text-center">
        <Logo className="mb-1 size-10 text-primary" />
        <h1 className="text-xl font-semibold">Login</h1>
      </div>

      {passwortGeaendert && (
        <p className="w-full max-w-sm rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-700 dark:text-emerald-400">
          Passwort geändert — melde dich damit neu an.
        </p>
      )}
      {error && (
        <p className="w-full max-w-sm rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {FEHLER_TEXT[error] ?? "Login fehlgeschlagen."}
        </p>
      )}

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Mit Passwort einloggen</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email"),
                password: formData.get("password"),
                redirectTo: "/",
              });
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="password-email">E-Mail-Adresse</Label>
              <Input
                id="password-email"
                name="email"
                type="email"
                required
                placeholder="name@verein.de"
                autoComplete="email"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Passwort</Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="current-password"
              />
            </div>
            <SubmitButton className="w-full" pendingText="Wird geprüft…">
              Einloggen
            </SubmitButton>
            {/* Kein formNoValidate hier: das E-Mail-Feld oben bleibt required
                und soll das auch für diesen Button bleiben (sonst lässt sich
                mit leerem E-Mail-Feld klicken, ohne dass sichtbar etwas
                passiert — die Server-Funktion tut dann still nichts). Das
                Passwort-Feld ist bewusst NICHT required, sonst würde die
                Browser-Validierung auch diesen Button blockieren, obwohl er
                gar kein Passwort braucht. Ein leeres Passwort führt beim
                normalen Login serverseitig ohnehin nur zu "falsches
                Passwort" (siehe authorize() in auth.ts), kein Absturz. */}
            <button
              type="submit"
              formAction={async (formData) => {
                "use server";
                const email = formData.get("email");
                if (typeof email === "string" && email) {
                  await signIn("nodemailer", {
                    email,
                    redirectTo: "/profil/passwort-aendern",
                  });
                }
              }}
              className="text-center text-xs text-muted-foreground underline"
            >
              Passwort vergessen? Login-Link zum Zurücksetzen senden
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="flex w-full max-w-sm items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        oder
        <div className="h-px flex-1 bg-border" />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Login-Link per E-Mail</CardTitle>
          <CardDescription>
            Kein Passwort nötig — wir schicken dir einen Login-Link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={async (formData) => {
              "use server";
              const email = formData.get("email");
              if (typeof email === "string" && email) {
                await signIn("nodemailer", { email, redirectTo: "/" });
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">E-Mail-Adresse</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="name@verein.de"
                autoComplete="email"
              />
            </div>
            <SubmitButton className="w-full" pendingText="Wird gesendet…">
              Login-Link senden
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
