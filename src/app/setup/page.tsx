import { bootstrapVerein } from "./actions";
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

export default function SetupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Verein einrichten</CardTitle>
          <CardDescription>
            Einmaliger Bootstrap: legt den ersten Verein und dessen
            Admin-Account an. Erfordert das Setup-Secret aus der
            Server-Umgebung.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={bootstrapVerein} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="secret">Setup-Secret</Label>
              <Input id="secret" name="secret" type="password" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="vereinsname">Vereinsname</Label>
              <Input id="vereinsname" name="vereinsname" type="text" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adminName">Name des Admins</Label>
              <Input id="adminName" name="adminName" type="text" required />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adminEmail">E-Mail des Admins</Label>
              <Input id="adminEmail" name="adminEmail" type="email" required />
            </div>

            <Button type="submit" className="w-full">
              Verein anlegen
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
