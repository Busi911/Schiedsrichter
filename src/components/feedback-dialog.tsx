"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircleIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/submit-button";
import { feedbackSenden } from "@/lib/feedback";

// In beiden eingeloggten Headern (admin/layout.tsx, profil/page.tsx)
// eingebunden — ein Icon-Button statt Text, damit er auf Mobile nicht mit
// den ohnehin schon knappen Header-Zeilen konkurriert (siehe dortige
// Kommentare zum Umbruchverhalten). aria-label trägt die Beschriftung für
// Screenreader/Tooltip nach.
export function FeedbackDialog() {
  const [offen, setOffen] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();

  async function action(formData: FormData) {
    await feedbackSenden(formData);
    setGesendet(true);
    formRef.current?.reset();
  }

  return (
    <Dialog
      open={offen}
      onOpenChange={(o) => {
        setOffen(o);
        if (!o) setGesendet(false);
      }}
    >
      <button
        type="button"
        aria-label="Feedback geben"
        onClick={() => setOffen(true)}
        className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))}
      >
        <MessageCircleIcon className="size-4" />
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Feedback geben</DialogTitle>
          <DialogDescription>
            Ist etwas unklar, fehlt eine Funktion, oder hakt etwas? Kurz
            aufschreiben — landet direkt bei uns.
          </DialogDescription>
        </DialogHeader>
        {gesendet ? (
          <p className="text-sm">
            Danke, ist angekommen! Du kannst das Fenster jetzt schließen.
          </p>
        ) : (
          <form ref={formRef} action={action} className="flex flex-col gap-3">
            <input type="hidden" name="seite" value={pathname ?? ""} />
            <Textarea
              name="nachricht"
              placeholder="Dein Feedback…"
              required
              autoFocus
            />
            <SubmitButton>Absenden</SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
