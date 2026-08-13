"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Passwort-Feld mit Anzeigen/Verstecken-Toggle — eigene Komponente statt
// type="password" direkt, da das Umschalten von type clientseitigen State
// braucht (Server Components können das nicht).
export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  const [sichtbar, setSichtbar] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={sichtbar ? "text" : "password"}
        className={cn("pr-8", className)}
      />
      <button
        type="button"
        onClick={() => setSichtbar((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={sichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
        tabIndex={-1}
      >
        {sichtbar ? (
          <EyeOffIcon className="size-4" />
        ) : (
          <EyeIcon className="size-4" />
        )}
      </button>
    </div>
  );
}
