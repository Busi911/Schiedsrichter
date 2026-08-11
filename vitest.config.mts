import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" wird normalerweise von Next.js selbst aufgelöst
      // (kein echtes npm-Paket in node_modules) — für Tests außerhalb des
      // Next.js-Build-Prozesses auf ein leeres Stub-Modul umleiten.
      "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
