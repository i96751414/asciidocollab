import { Logo } from "@/components/logo";

/** Content rendered centered inside the card container on unauthenticated pages. */
interface AuthLayoutProperties {
  /** Page content to render centered inside the card container. */
  children: React.ReactNode;
}

/**
 * Centered card layout for all authentication pages.
 */
export default function AuthLayout({ children }: AuthLayoutProperties) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="flex justify-center">
            <Logo href="/dashboard" iconSize={38} />
          </div>
          <p className="text-sm text-muted-foreground text-center mt-2">
            Collaborative AsciiDoc editing for teams
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
