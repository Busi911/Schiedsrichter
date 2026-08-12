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
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/submit-button";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-1 size-10 text-primary" />
          <CardTitle className="text-xl">Login</CardTitle>
          <CardDescription>
            Wir schicken dir einen Login-Link per E-Mail.
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
