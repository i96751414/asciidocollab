"use client";

import { useMemo, useState, useTransition } from "react";
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
import { authApi, ApiError } from "@/lib/api";
import { buildPasswordSchema } from "@/lib/password-schema";
import { useTouchedFields } from "@/hooks/use-touched-fields";
import type { PasswordPolicyDto } from "@asciidocollab/shared";

const FIELDS = ["newPassword", "confirmPassword"] as const;
type FieldName = (typeof FIELDS)[number];

/** Props for the ResetPasswordForm component. */
interface ResetPasswordFormProperties {
  /** The raw reset token from the URL query parameter. */
  token: string;
  /** Password policy used to build client-side validation rules. */
  passwordPolicy: PasswordPolicyDto;
}

/** Form that lets a user set a new password after clicking a reset link. */
export function ResetPasswordForm({ token, passwordPolicy }: ResetPasswordFormProperties) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { touch, touchAll, isTouched } = useTouchedFields(FIELDS);

  const schema = useMemo(
    () =>
      z
        .object({
          newPassword: buildPasswordSchema(passwordPolicy),
          confirmPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    [passwordPolicy],
  );

  const validation = schema.safeParse({ newPassword, confirmPassword });
  const isFormValid = validation.success;
  const allFieldErrors = validation.success ? {} : z.flattenError(validation.error).fieldErrors;

  function visibleError(field: FieldName): string | undefined {
    if (!isTouched(field)) return undefined;
    if (field === "confirmPassword" && allFieldErrors.newPassword?.length) return undefined;
    return allFieldErrors[field]?.[0];
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    touchAll();

    if (!isFormValid) return;

    startTransition(async () => {
      try {
        await authApi.resetPassword(token, newPassword);
        router.push("/login");
      } catch (error_) {
        setSubmitError(
          error_ instanceof ApiError
            ? error_.message
            : "Password reset failed. Please request a new link.",
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set new password</CardTitle>
        <CardDescription>Enter a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} role="form" aria-label="Reset password">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                onBlur={() => touch("newPassword")}
                aria-invalid={!!visibleError("newPassword")}
                autoComplete="new-password"
              />
              {visibleError("newPassword") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("newPassword")}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
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
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!isFormValid || isPending}>
              {isPending ? "Resetting…" : "Reset password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
