import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BackButtonProperties {
  /** Destination of the back navigation. */
  href: string;
  /** Accessible label describing where the button goes (e.g. "Back to project"). */
  label: string;
}

/** Bordered ghost icon button linking back to a parent view. Shared by the editor and project sub-pages. */
export function BackButton({ href, label }: BackButtonProperties) {
  return (
    <Button asChild variant="outline" size="icon" className="h-8 w-8 shrink-0">
      <Link href={href} aria-label={label}>
        <ChevronLeft className="h-4 w-4" />
      </Link>
    </Button>
  );
}
