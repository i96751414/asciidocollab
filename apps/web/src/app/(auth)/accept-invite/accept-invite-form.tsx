"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminApi, authApi, ApiError } from "@/lib/api";
import { buildPasswordSchema } from "@/lib/password-schema";
import type { PasswordPolicyDto } from "@asciidocollab/shared";

/** Properties for the AcceptInviteForm component. */
interface AcceptInviteFormProperties {
  /** Invitation token from the URL query string. */
  token: string;
}

/** Form for completing account registration via an invitation token. */
export function AcceptInviteForm({ token }: AcceptInviteFormProperties) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [tokenState, setTokenState] = useState<"loading" | "valid" | "invalid">("loading");
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicyDto | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    Promise.all([
      adminApi.getAcceptInvitePreview(token),
      authApi.setupStatus(),
    ])
      .then(([previewData, setupData]) => {
        setEmail(previewData.email);
        setPasswordPolicy(setupData.passwordPolicy);
        setTokenState("valid");
      })
      .catch(() => setTokenState("invalid"));
  }, [token]);

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!passwordPolicy) return;

    if (!displayName || displayName.trim().length === 0) {
      setSubmitError("Display name is required");
      return;
    }
    if (displayName.length > 100) {
      setSubmitError("Display name must be 100 characters or fewer");
      return;
    }

    const passwordResult = buildPasswordSchema(passwordPolicy).safeParse(password);
    if (!passwordResult.success) {
      setSubmitError(passwordResult.error.issues[0]?.message ?? "Password does not meet requirements");
      return;
    }

    startTransition(async () => {
      try {
        await adminApi.acceptInvite(token, displayName, password);
        router.push("/dashboard");
      } catch (error) {
        setSubmitError(
          error instanceof ApiError ? error.message : "Registration failed. Please try again.",
        );
      }
    });
  }

  if (tokenState === "loading") {
    return (
      <Card>
        <CardHeader><CardTitle>Checking invitation…</CardTitle></CardHeader>
      </Card>
    );
  }

  if (tokenState === "invalid") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid invitation</CardTitle>
          <CardDescription>This invitation link is invalid, expired, or has already been used.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete your registration</CardTitle>
        <CardDescription>You were invited to join AsciiDoCollab as {email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email ?? ""} disabled readOnly />
            </div>
            <div className="space-y-1">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            {submitError && (
              <p role="alert" className="text-sm text-destructive">{submitError}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending || !passwordPolicy}>
              {isPending ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
