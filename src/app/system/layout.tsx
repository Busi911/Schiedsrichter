import type { Metadata } from "next";
import { LogOutIcon } from "lucide-react";
import { requireSystemAdmin } from "@/lib/session";
import { signOut } from "@/auth";
import { SubmitButton } from "@/components/submit-button";
import { SystemNav } from "@/components/system-nav";
import { Logo } from "@/components/logo";

// Eigenes PWA-Icon/App-Name für den Systemadmin-Bereich, siehe Kommentar bei
// gleichnamigem metadata-Export in src/app/admin/layout.tsx.
export const metadata: Metadata = {
  title: "HandballerPate Systemadmin",
  manifest: "/manifest-system.json",
  icons: {
    apple: "/icons/system-apple.png",
  },
};

export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSystemAdmin();

  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          {/* Logout auf Mobile direkt neben dem Namen (gleiche Zeile) statt
              als eigene, dort einsam links stehende Zeile weiter unten —
              gleiches Prinzip wie im Admin-Header, siehe dort. */}
          <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
            <div className="flex items-center gap-3">
              <Logo className="size-8 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Systemadmin
                </p>
                <p className="font-heading text-lg font-semibold">
                  {session.user.name ?? session.user.email}
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
          <SystemNav />
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
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
