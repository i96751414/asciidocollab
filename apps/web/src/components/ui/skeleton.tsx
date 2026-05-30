"use client";

interface SkeletonProperties {
  className?: string;
}

/**
 * Skeleton loading component.
 *
 * @param className - Additional CSS classes.
 */
export function Skeleton({ className }: SkeletonProperties) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className}`} />
  );
}

/**
 * Loading spinner component.
 */
export function Spinner() {
  return (
    <div className="flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

/**
 * Page loading component with skeleton.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-48" />
        ))}
      </div>
    </div>
  );
}
