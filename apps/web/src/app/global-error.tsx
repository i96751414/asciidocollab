'use client';

/**
 * Full-page error boundary fallback rendered by Next.js when the root layout throws.
 */
export default function GlobalError({
  reset,
}: {
  /** Error thrown by the page or layout. */
  error: Error & { /** Optional Next.js digest hash for server-side errors. */
  digest?: string };
  /** Retries rendering by resetting the error boundary. */
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          margin: 0,
          gap: '1rem',
        }}
      >
        <h2>Something went wrong</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
