import { redirect } from "next/navigation";

// Hallenspielplan und Termine sind zu einer Seite mit Tabs zusammengelegt
// (siehe /admin/termine) — dieser Redirect hält alte Links/Lesezeichen und
// bereits verschickte E-Mails (siehe rundenspiel-benachrichtigung.ts) am
// Leben.
export default function RundenspielePage() {
  redirect("/admin/termine?tab=rundenspiele");
}
