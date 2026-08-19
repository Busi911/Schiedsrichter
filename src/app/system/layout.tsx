import type { Metadata } from "next";
import { LogOutIcon } from "lucide-react";
import { requireSystemAdmin } from "@/lib/session";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
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
          <SystemNav />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="icon-sm"
              aria-label="Logout"
            >
              <LogOutIcon />
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
