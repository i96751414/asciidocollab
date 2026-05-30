import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { authApi } from "@/lib/api";

/** Root page — redirects to dashboard, register, or login based on auth and setup state. */
export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  const { configured } = await authApi.setupStatus();
  if (!configured) {
    redirect("/register");
  }

  redirect("/login");
}
