import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { signOut } from "@/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <p className="text-xs uppercase text-gray-500">Vereinsadmin</p>
          <p className="font-medium">
            {session.user.name ?? session.user.email}
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/mannschaften">Mannschaften</Link>
          <Link href="/admin/funktionstraeger">Funktionsträger</Link>
          <Link href="/admin/termine">Termine</Link>
          <Link href="/admin/zuordnung">Zuordnung</Link>
          <Link href="/admin/auswertung">Auswertung</Link>
          <Link href="/admin/zuschuesse">Zuschüsse</Link>
          <Link href="/admin/einstellungen">Einstellungen</Link>
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm underline">
            Logout
          </button>
        </form>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
