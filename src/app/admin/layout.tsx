import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { funktionstraegerRollen, vereine } from "@/db/schema";
import { signOut } from "@/auth";
import { holeOffenePosten, holeOffeneSchiedsrichterAnzahl } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/components/admin-nav";
import { Logo } from "@/components/logo";

// Eigenes PWA-Icon/App-Name für den Admin-Bereich, damit "Zum Home-Bildschirm
// hinzufügen" hier eine eigene Identität liefert statt der generischen
// HandballerPate-App aus dem Root-Layout (siehe src/app/layout.tsx).
export const metadata: Metadata = {
  title: "HandballerPate Admin",
  manifest: "/manifest-admin.json",
  icons: {
    apple: "/icons/admin-apple.png",
  },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const vereinId = session.user.vereinId!;
  const { verein, hatEigeneRollen } = await withTenant(
    vereinId,
    async (tx) => {
      const verein = await tx.query.vereine.findFirst({
        where: eq(vereine.id, vereinId),
      });
      // Ein Admin kann zusätzlich eigene Funktionsträger-Rollen haben (z.B.
      // selbst Schiedsrichter sein) — dafür braucht es einen Weg zu /profil,
      // da die Startseite Admins immer direkt zu /admin schickt.
      const eigeneRolle = await tx.query.funktionstraegerRollen.findFirst({
        where: eq(funktionstraegerRollen.userId, session.user.id),
      });
      return { verein, hatEigeneRollen: !!eigeneRolle };
    }
  );
  // Auf jeder Admin-Seite sichtbar (nicht nur auf der Übersicht) — der Admin
  // soll die Besetzung nur noch überwachen, die eigentliche Zuordnung
  // übernehmen die jeweiligen Wart-Rollen (siehe /admin/dienste).
  const [offeneDiensteAnzahl, offeneSchiedsrichterAnzahl] = await Promise.all([
    holeOffenePosten(vereinId).then((p) => p.length),
    holeOffeneSchiedsrichterAnzahl(vereinId),
  ]);

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo className="size-8 shrink-0 text-primary" />
            <div>
              <p className="font-heading text-lg font-semibold">
                {verein?.name ?? "Verein"}
              </p>
              <p className="text-xs text-muted-foreground">
                {session.user.istAdmin
                  ? "Vereinsadmin"
                  : "Vereinsadmin (nur lesend)"}{" "}
                · {session.user.name ?? session.user.email}
              </p>
            </div>
          </div>
          <AdminNav />
          <div className="flex items-center gap-2">
            {offeneDiensteAnzahl > 0 && (
              <Link href="/admin/dienste">
                <Badge variant="warning">{offeneDiensteAnzahl} Dienste offen</Badge>
              </Link>
            )}
            {offeneSchiedsrichterAnzahl > 0 && (
              <Link href="/admin/kalender">
                <Badge variant="warning">
                  {offeneSchiedsrichterAnzahl} Schiris offen
                </Badge>
              </Link>
            )}
            {hatEigeneRollen && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/profil" />}
                nativeButton={false}
              >
                Mein Profil
              </Button>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl p-6">{children}</main>
    </div>
  );
}
