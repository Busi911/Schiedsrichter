#!/usr/bin/env node
import { execSync } from "node:child_process";

// Wendet ausstehende Migrationen automatisch NUR bei einem echten
// Production-Deploy an (VERCEL_ENV wird von Vercel selbst gesetzt, siehe
// https://vercel.com/docs/environment-variables/system-environment-variables)
// — nicht bei Preview-Deployments (PR-Branches sollen nicht automatisch die
// Produktions-DB verändern) und nicht bei lokalen Builds. Ein Fehlschlag
// hier lässt `npm run build` (und damit den Vercel-Build) fehlschlagen,
// statt Code zu deployen, der ein Schema erwartet, das nicht existiert.
if (process.env.VERCEL_ENV !== "production") {
  console.log(
    `Migration übersprungen (VERCEL_ENV=${process.env.VERCEL_ENV ?? "lokal"}, nur bei Production automatisch).`
  );
  process.exit(0);
}

console.log("Production-Deploy erkannt — wende ausstehende Migrationen an…");
execSync("npx drizzle-kit migrate", { stdio: "inherit" });
