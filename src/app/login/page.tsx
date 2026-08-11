import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
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
            <Button type="submit" className="w-full">
              Login-Link senden
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
