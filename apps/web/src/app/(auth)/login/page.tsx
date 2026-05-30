import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { LoginForm } from "./login-form";

/** Route segment props for the login page. */
interface LoginPageProperties {
  /** Next.js async search params. */
  searchParams: Promise<{ redirect?: string; reason?: string }>;
}

/**
 * Login page — redirects authenticated users and unconfigured installs.
 */
export default async function LoginPage({ searchParams }: LoginPageProperties) {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const { configured } = await authApi.setupStatus();
  if (!configured) {
    redirect("/register");
  }

  const parameters = await searchParams;
  const redirectTo = parameters.redirect ?? "/dashboard";
  const reason = parameters.reason;

  return (
    <LoginForm redirectTo={redirectTo} showExpiredNotice={reason === "expired"} />
  );
}
