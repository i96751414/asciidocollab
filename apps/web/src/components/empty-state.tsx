import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/logo";

interface EmptyStateProperties {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

/**
 * Empty state component displayed when no data is available.
 *
 * @param title - The title to display.
 * @param description - The description to display.
 * @param actionLabel - Optional label for the action button.
 * @param actionHref - Optional href for the action button.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProperties) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4" aria-hidden="true">
        <LogoMark className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      {actionLabel && actionHref && (
        <Button asChild className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
