import { AcceptInviteForm } from "./accept-invite-form";

interface AcceptInvitePageProperties {
  searchParams: Promise<{ token?: string }>;
}

/** Page that extracts the invitation token from the URL and renders the accept-invite form. */
export default async function AcceptInvitePage({ searchParams }: AcceptInvitePageProperties) {
  const { token } = await searchParams;
  return <AcceptInviteForm token={token ?? ""} />;
}
