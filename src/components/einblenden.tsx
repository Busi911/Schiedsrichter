"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Blendet den Inhalt sanft ein, sobald er beim Scrollen ins Bild kommt (Startseite).
// Was beim Laden schon sichtbar ist, bleibt unverändert; ohne JavaScript oder bei "Bewegung reduzieren" ist alles sofort da (siehe globals.css).
export function Einblenden({ children, verzoegerung = 0, className = "" }: { children: ReactNode; verzoegerung?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // schon im Bild
    el.classList.add("einblenden-aus");
    requestAnimationFrame(() => el.classList.add("einblenden"));
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (eintraege.some((e) => e.isIntersecting)) {
          el.classList.add("einblenden-an");
          beobachter.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={{ ["--einblenden-verzoegerung" as string]: `${verzoegerung}ms` }}>
      {children}
    </div>
  );
}
