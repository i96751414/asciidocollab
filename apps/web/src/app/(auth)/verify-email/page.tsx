"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApi, ApiError } from "@/lib/api";

/** Page that processes a verification token from the URL and shows the result. */
export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const token = searchParameters.get("token") ?? "";

  const [state, setState] = useState<"verifying" | "success-redirect" | "success-login" | "error" | "expired">("verifying");
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }

    adminApi.verifyEmail(token)
      .then(async () => {
        // Check whether the current session was upgraded by the verification.
        // When a user clicks the link in a different browser / device (no session
        // cookie present), the API marks the DB record as verified but cannot
        // upgrade the original session. Blindly redirecting to /dashboard in that
        // case would loop through /verify-email-required because the active session
        // still has emailVerified=false. Instead, show a "Log in" prompt.
        const sessionStatus = await adminApi
          .getSessionStatus()
          .catch(() => ({ authenticated: false, emailVerified: false, isAdmin: false }));

        if (sessionStatus.authenticated && sessionStatus.emailVerified) {
          setState("success-redirect");
          setTimeout(() => router.push("/dashboard"), 2000);
        } else {
          setState("success-login");
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.code === "INVALID_TOKEN") {
          setState("expired");
        } else {
          setState("error");
        }
      });
  }, [token, router]);

  async function handleResend() {
    try {
      await adminApi.resendVerification();
      setResendMessage("Verification email sent. Please check your inbox.");
    } catch {
      setResendMessage("Failed to resend. Please try again later.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {state === "verifying" && "Verifying your email…"}
          {(state === "success-redirect" || state === "success-login") && "Email verified!"}
          {(state === "error" || state === "expired") && "Verification failed"}
        </CardTitle>
        <CardDescription>
          {state === "success-redirect" && "Redirecting to your dashboard…"}
          {state === "success-login" && "Your email has been confirmed. Please log in to continue."}
          {state === "expired" && "This verification link has expired or already been used."}
          {state === "error" && "Something went wrong. Please try again."}
        </CardDescription>
      </CardHeader>

      {state === "success-login" && (
        <CardContent>
          <Link href="/login">
            <Button className="w-full">Log in</Button>
          </Link>
        </CardContent>
      )}

      {(state === "expired" || state === "error") && (
        <CardContent className="space-y-2">
          <Button onClick={handleResend} variant="outline">
            Resend verification email
          </Button>
          {resendMessage && (
            <p className="text-sm text-muted-foreground">{resendMessage}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
