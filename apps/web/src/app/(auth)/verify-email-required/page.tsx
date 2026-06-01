"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApi } from "@/lib/api";

/** Page shown to users whose email is not yet verified, with a resend button. */
export default function VerifyEmailRequiredPage() {
  const [message, setMessage] = useState<string | null>(null);

  async function handleResend() {
    try {
      await adminApi.resendVerification();
      setMessage("Verification email sent. Please check your inbox.");
    } catch {
      setMessage("Failed to resend. Please try again later.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your email</CardTitle>
        <CardDescription>
          You need to verify your email address before accessing the application.
          Check your inbox for a verification email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button onClick={handleResend} variant="outline">
          Resend verification email
        </Button>
        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </CardContent>
    </Card>
  );
}
