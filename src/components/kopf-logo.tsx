"use client";

import { useState } from "react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

// Logo in der Kopfzeile: das Vereinslogo (object-contain, nie beschnitten), wenn der Verein eines hat und es lädt — sonst das HandballerPate-Logo.
export function KopfLogo({
  logo,
  className = "size-8",
}: {
  logo: { slug: string; version: number } | null;
  className?: string;
}) {
  const [fehler, setFehler] = useState(false);
  if (logo && !fehler) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/verein/${logo.slug}/logo?v=${logo.version}`}
        alt=""
        onError={() => setFehler(true)}
        className={cn(className, "shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-foreground/10")}
      />
    );
  }
  return <Logo className={cn(className, "shrink-0 text-primary")} />;
}
