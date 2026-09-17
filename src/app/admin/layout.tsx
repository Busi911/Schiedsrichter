import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { withTenant } from "@/db";
import { vereine } from "@/db/schema";
import { signOut } from "@/auth";
import { holeOffenePosten, holeOffeneSchiedsrichterAnzahl } from "@/lib/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";
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
  const verein = await withTenant(vereinId, (tx) =>
    tx.query.vereine.findFirst({ where: eq(vereine.id, vereinId) })
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
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 px-6 py-4 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          {/* Oben: Vereinsname + Logout auf gleicher Höhe, wie bei jedem
              anderen Header oben rechts erwartet — auf Mobile sonst würde
              der Logout-Button erst nach der (dort mehrzeiligen) Nav/Badges-
              Zeile auftauchen. Auf Desktop übernimmt stattdessen der zweite
              Logout-Button unten neben den Badges (gleiche Zeile wie Nav),
              hier bleibt dann nur der Vereinsname übrig. */}
          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
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
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="md:hidden"
            >
              <SubmitButton
                variant="outline"
                size="icon-sm"
                aria-label="Logout"
                pendingText=""
              >
                <LogOutIcon />
              </SubmitButton>
            </form>
          </div>
          <AdminNav />
          <div className="flex flex-wrap items-center gap-2">
            {offeneDiensteAnzahl > 0 && (
              <Link href="/admin/dienste">
                <Badge variant="warning">{offeneDiensteAnzahl} Dienste offen</Badge>
              </Link>
            )}
            {offeneSchiedsrichterAnzahl > 0 && (
              // Ziel /admin statt /admin/kalender: die "Unbesetzte
              // Termine"-Karte dort listet genau diese offenen Posten, der
              // Kalender selbst zeigt keine dedizierte Schiri-Liste.
              <Link href="/admin">
                <Badge variant="warning">
                  {offeneSchiedsrichterAnzahl} Schiris offen
                </Badge>
              </Link>
            )}
            {/* Nicht mehr an eigene Funktionsträger-Rollen gekoppelt: ein
                Admin OHNE eigene Rolle landete sonst nie auf /profil und kam
                damit auch nie an die dortigen Wart-Buttons (istAdmin greift
                dort als Bypass, siehe profil/page.tsx) — u.a. der einzige
                Weg zu den öffentlichen Selbsteintragungs-Links. */}
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/profil" />}
              nativeButton={false}
            >
              Mein Profil
            </Button>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="hidden md:block"
            >
              <SubmitButton
                variant="outline"
                size="icon-sm"
                aria-label="Logout"
                pendingText=""
              >
                <LogOutIcon />
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-screen-2xl p-6">{children}</main>
    </div>
  );
}
