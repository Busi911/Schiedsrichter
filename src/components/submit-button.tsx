"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// useFormStatus liest den pending-Status der umgebenden <form action={...}>
// — muss deshalb ein Client-Component-Kind des Formulars sein, nicht das
// Formular selbst (das bleibt eine Server Component mit Server Action).
export function SubmitButton({
  children,
  pendingText,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? (pendingText ?? "Wird ausgeführt…") : children}
    </Button>
  );
}
