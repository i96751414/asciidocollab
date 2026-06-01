import { VerifyEmailContent } from "./verify-email-content";

/** Properties for the VerifyEmailPage server component. */
interface VerifyEmailPageProperties {
  /** Resolved query string parameters from Next.js. */
  searchParams: Promise<{ token?: string }>;
}

/** Server component that reads the token from the URL and passes it to the client. */
export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProperties) {
  const { token } = await searchParams;
  return <VerifyEmailContent token={token ?? ""} />;
}
