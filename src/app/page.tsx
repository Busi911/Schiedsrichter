import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">FunktionsträgerHub</h1>
        <p className="text-sm text-gray-600">
          Verwaltungsplattform für Funktionsträger im Handballverein.
        </p>
        <Link
          href="/login"
          className="rounded bg-black px-3 py-2 text-white"
        >
          Login
        </Link>
      </main>
    );
  }

  redirect(session.user.istAdmin ? "/admin" : "/profil");
}
