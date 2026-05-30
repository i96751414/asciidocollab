import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { RegisterForm } from "./register-form";

/**
 * Register page — only accessible when no users exist yet (first-run setup).
 */
export default async function RegisterPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const { configured } = await authApi.setupStatus();
  if (configured) {
    redirect("/login");
  }

  return <RegisterForm isFirstRun={true} />;
}
