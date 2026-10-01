import Link from "next/link";
import { Logo } from "@/components/logo";

// Gemeinsamer Rahmen der öffentlichen Vereins-/Mannschaftsseiten — bewusst
// schlank (kein Admin-/Profil-Menü), mobil zuerst.
export default function VereinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="size-6 text-primary" />
            <span className="font-heading font-semibold">HandballerPate</span>
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Anmelden
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
