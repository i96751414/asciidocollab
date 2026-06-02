import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { authApi } from "@/lib/api";
import { DisplayNameCard } from "./display-name-card";
import { PasswordCard } from "./password-card";
import { EmailCard } from "./email-card";
import { KeyboardShortcutsCard } from "./keyboard-shortcuts-card";

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

  const { displayName, email } = profile;
  const { passwordPolicy } = setup;
  const emailConfirmed = parameters.confirmed === 'email';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Account</h2>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>
      {emailConfirmed && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Email address updated successfully.
        </div>
      )}
      <DisplayNameCard displayName={displayName} />
      <PasswordCard passwordPolicy={passwordPolicy} />
      <EmailCard email={email} />
      <KeyboardShortcutsCard />
    </div>
  );
}
