// Selten gebrauchte, eher heikle Aktionen (z.B. "Link neu generieren",
// "Deaktivieren") einklappen, sobald sie nichts Naheliegendes mehr sind —
// sichtbar bleibt dann nur die Hauptaktion (z.B. Link kopieren). Ohne
// Einklappen (z.B. solange noch nichts aktiviert ist) stehen die Schaltflächen
// wie bisher direkt nebeneinander. Native <details>, daher ohne Client-State
// und auch in Server Components nutzbar.
export function WeitereOptionen({
  eingeklappt,
  children,
}: {
  eingeklappt: boolean;
  children: React.ReactNode;
}) {
  if (!eingeklappt) {
    return <div className="flex flex-wrap gap-2">{children}</div>;
  }
  return (
    <details className="group text-sm">
      <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground underline-offset-4 select-none hover:underline [&::-webkit-details-marker]:hidden">
        Weitere Optionen
      </summary>
      <div className="flex flex-wrap gap-2 pt-2">{children}</div>
    </details>
  );
}
