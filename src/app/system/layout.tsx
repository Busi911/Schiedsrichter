import { requireSystemAdmin } from "@/lib/session";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

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
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Systemadmin
            </p>
            <p className="font-heading text-lg font-semibold">
              {session.user.name ?? session.user.email}
            </p>
          </div>
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
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
    </div>
  );
}
