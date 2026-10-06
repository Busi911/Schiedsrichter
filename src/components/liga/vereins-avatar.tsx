"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { vereinsInitialen } from "@/lib/liga-pwa";

// Vereinslogo (unsere eigene Kopie über /verein/[slug]/logo) oder, wenn keins da ist bzw. nicht lädt, ein
// Avatar mit Initialen — nie ein kaputtes Bildsymbol. object-contain: das Logo wird nie beschnitten.
export function VereinsAvatar({
  name,
  slug,
  logoVersion,
  className,
}: {
  name: string;
  slug: string;
  logoVersion: number | null;
  className?: string;
}) {
  const [fehler, setFehler] = useState(false);
  const groesse = cn("size-10 shrink-0 rounded-lg", className);
  if (logoVersion && !fehler) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/verein/${slug}/logo?v=${logoVersion}`}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        onError={() => setFehler(true)}
        className={cn(groesse, "bg-white object-contain p-0.5 ring-1 ring-foreground/10")}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(groesse, "flex items-center justify-center bg-primary/10 font-heading text-sm font-extrabold text-primary")}
    >
      {vereinsInitialen(name)}
    </span>
  );
}
