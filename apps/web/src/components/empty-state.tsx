import Link from "next/link";
import { Button } from "@/components/ui/button";

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
      <div className="rounded-full bg-muted p-4 mb-4">
        <svg
          className="h-8 w-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
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
