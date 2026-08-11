import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.vereinId) {
    redirect("/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!session.user.istAdmin) {
    redirect("/profil");
  }
  return session;
}
