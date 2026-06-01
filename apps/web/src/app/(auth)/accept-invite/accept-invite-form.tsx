"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
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

type FieldName = "displayName" | "password" | "confirmPassword";

function buildAcceptInviteSchema(policy: PasswordPolicyDto) {
  return z
    .object({
      displayName: z
        .string()
        .min(1, "Display name is required")
        .max(100, "Display name must be at most 100 characters"),
      password: buildPasswordSchema(policy),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    });
}

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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
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

  const schema = useMemo(
    () => (passwordPolicy ? buildAcceptInviteSchema(passwordPolicy) : null),
    [passwordPolicy],
  );

  const validation = schema?.safeParse({ displayName, password, confirmPassword });
  const isFormValid = validation?.success ?? false;
  const allFieldErrors =
    validation && !validation.success ? z.flattenError(validation.error).fieldErrors : {};

  function visibleError(field: FieldName): string | undefined {
    if (!touched[field]) return undefined;
    if (field === "confirmPassword" && allFieldErrors.password?.length) return undefined;
    return allFieldErrors[field]?.[0];
  }

  function touch(field: FieldName) {
    setTouched((previous) => ({ ...previous, [field]: true }));
  }

  function touchAll() {
    setTouched({ displayName: true, password: true, confirmPassword: true });
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    touchAll();

    if (!isFormValid) return;

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
                onBlur={() => touch("displayName")}
                aria-invalid={!!visibleError("displayName")}
                autoComplete="name"
              />
              {visibleError("displayName") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("displayName")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onBlur={() => touch("password")}
                aria-invalid={!!visibleError("password")}
                autoComplete="new-password"
              />
              {visibleError("password") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("password")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onBlur={() => touch("confirmPassword")}
                aria-invalid={!!visibleError("confirmPassword")}
                autoComplete="new-password"
              />
              {visibleError("confirmPassword") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("confirmPassword")}
                </p>
              )}
            </div>
            {submitError && (
              <p role="alert" className="text-sm text-destructive">{submitError}</p>
            )}
            <Button type="submit" className="w-full" disabled={!isFormValid || isPending || !passwordPolicy}>
              {isPending ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
