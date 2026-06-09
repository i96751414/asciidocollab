import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { DisplayNameCard } from "./display-name-card";
import { PasswordCard } from "./password-card";
import { EmailCard } from "./email-card";

interface AccountPageProperties {
  searchParams: Promise<Record<string, string | undefined>>;
}

/** Server component that renders the account management page. */
export default async function AccountPage({ searchParams }: AccountPageProperties) {
  const parameters = await searchParams;

  const profile = await getProfile();
  if (!profile) {
    redirect("/login?reason=expired");
  }

  const setup = await authApi.setupStatus();

  const { displayName, email, avatarKey } = profile;
  const { passwordPolicy } = setup;
  const emailConfirmed = parameters.confirmed === 'email';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Account</h2>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>
      {emailConfirmed && (
        <div className="rounded-md border p-3 text-sm border-[hsl(var(--success-border))] bg-[hsl(var(--success-bg))] text-[hsl(var(--success))]">
          Email address updated successfully.
        </div>
      )}
      <DisplayNameCard displayName={displayName} avatarKey={avatarKey} />
      <PasswordCard passwordPolicy={passwordPolicy} />
      <EmailCard email={email} />
    </div>
  );
}
