import Link from "next/link";
import { authApi } from "@/lib/api";
import { ResetPasswordForm } from "./reset-password-form";

/** Props for the ResetPasswordPage component. */
interface ResetPasswordPageProperties {
  /** Query parameters including the reset token. */
  searchParams: Promise<{ token?: string }>;
}

/** Server component that validates the reset token and renders the form. */
export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProperties) {
  const parameters = await searchParams;
  const token = parameters.token;

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-destructive">
          This reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" className="text-sm underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  const { passwordPolicy } = await authApi.setupStatus();

  return <ResetPasswordForm token={token} passwordPolicy={passwordPolicy} />;
}
