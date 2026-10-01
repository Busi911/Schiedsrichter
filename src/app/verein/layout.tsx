// Gemeinsame Hülle der öffentlichen Fan-Web-App (/verein/...). Die
// Akzentfarbe/der Kopf kommen vom jeweiligen Verein (siehe [slug]/layout.tsx)
// bzw. von der Vereinsübersicht; ".fan" begrenzt die Farbüberschreibung.
export default function VereinLayout({ children }: { children: React.ReactNode }) {
  return <div className="fan flex flex-1 flex-col">{children}</div>;
}
