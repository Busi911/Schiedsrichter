import Link from "next/link";
import { CircleHelpIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// In allen eingeloggten Headern eingebunden (admin, profil, system) — der
// Footer-Link allein war zu leicht zu übersehen (steht erst ganz unten,
// auf langen Seiten weit weg vom sichtbaren Bereich). Icon-Button statt
// Text, konsistent mit FeedbackDialog daneben (siehe dortiger Kommentar
// zum Umbruchverhalten auf Mobile).
export function HilfeLink() {
  return (
    <Link
      href="/hilfe"
      aria-label="Hilfe"
      className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
    >
      <CircleHelpIcon className="size-4" />
    </Link>
  );
}
