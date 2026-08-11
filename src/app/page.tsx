import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">FunktionsträgerHub</CardTitle>
            <CardDescription>
              Verwaltungsplattform für Funktionsträger im Handballverein.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              render={<Link href="/login" />}
              nativeButton={false}
              className="w-full"
            >
              Login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (session.user.istSystemAdmin) redirect("/system/vereine");
  redirect(session.user.istAdmin ? "/admin" : "/profil");
}
