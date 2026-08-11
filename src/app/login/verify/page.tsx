import { MailCheckIcon } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function VerifyRequestPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <MailCheckIcon className="mb-2 size-8 text-muted-foreground" />
          <CardTitle className="text-xl">E-Mail gesendet</CardTitle>
          <CardDescription>
            Wir haben dir einen Login-Link per E-Mail geschickt. Bitte prüfe
            dein Postfach.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
