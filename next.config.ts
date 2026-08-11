import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lädt seine Font-Metrik-Dateien (.afm) zur Laufzeit relativ zu
  // __dirname vom Dateisystem — beim Bundling durch Turbopack/Webpack wird
  // dieser Pfad ungültig. Deshalb hier vom Bundling ausschließen und normal
  // per node_modules require() laden.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
