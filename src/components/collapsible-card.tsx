import { ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Natives <details>/<summary> statt Client-Component-State — passt zum
// Projektstil ("Formulare bleiben native Elemente ohne Client-JS-State",
// siehe README) und braucht keinerlei JavaScript zum Auf-/Zuklappen.
export function CollapsibleCard({
  title,
  description,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <details open={defaultOpen} className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          </CardHeader>
        </summary>
        <CardContent>{children}</CardContent>
      </details>
    </Card>
  );
}
