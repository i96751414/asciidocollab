import Link from "next/link";

/**
 *
 */
export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">403</h1>
        <h2 className="text-xl font-semibold">Not Authorised</h2>
        <p className="text-muted-foreground">
          You do not have permission to access this page.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-4 text-primary underline underline-offset-4"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
