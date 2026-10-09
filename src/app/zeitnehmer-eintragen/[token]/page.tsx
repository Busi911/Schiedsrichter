import { redirect } from "next/navigation";

// Frühere Adresse der öffentlichen Selbsteintragung: bestehende Links bleiben gültig und führen mit demselben Token auf die gemeinsame
// Seite /eintragen/[token] (siehe dort). Die Server Actions in actions.ts nutzt die gemeinsame Seite weiter.
export default async function Weiterleitung({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mannschaft?: string }>;
}) {
  const { token } = await params;
  const { mannschaft } = await searchParams;
  redirect(`/eintragen/${encodeURIComponent(token)}${mannschaft ? `?mannschaft=${encodeURIComponent(mannschaft)}` : ""}`);
}
