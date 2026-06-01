import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { authApi, adminApi } from "@/lib/api";
import { RegisterForm } from "./register-form";

/** Registration page — redirects authenticated users and checks open-registration settings before rendering. */
export default async function RegisterPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const { configured, passwordPolicy } = await authApi.setupStatus();

  if (configured) {
    // If setup is complete, check whether open registration is enabled
    const { openRegistration } = await adminApi.getOpenRegistrationStatus().catch(() => ({ openRegistration: false }));
    if (!openRegistration) {
      redirect("/login");
    }
    return <RegisterForm isFirstRun={false} passwordPolicy={passwordPolicy} />;
  }

  return <RegisterForm isFirstRun={true} passwordPolicy={passwordPolicy} />;
}
