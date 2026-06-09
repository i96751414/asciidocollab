"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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

const FIELDS = ["currentPassword", "newPassword", "confirmPassword"] as const;
type FieldName = (typeof FIELDS)[number];

interface PasswordCardProperties {
  passwordPolicy: PasswordPolicyDto;
}

/** Card that lets an authenticated user change their account password. */
export function PasswordCard({ passwordPolicy }: PasswordCardProperties) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const successTimerReference = useRef<ReturnType<typeof setTimeout>>(null);
  const { touch, touchAll, isTouched } = useTouchedFields(FIELDS);

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, "Current password is required"),
          newPassword: buildPasswordSchema(passwordPolicy),
          confirmPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    [passwordPolicy],
  );

  const validation = schema.safeParse({ currentPassword, newPassword, confirmPassword });
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
    setSuccessMessage(null);
    touchAll();

    if (!isFormValid) return;

    startTransition(async () => {
      try {
        await authApi.changePassword(currentPassword, newPassword);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        if (successTimerReference.current) clearTimeout(successTimerReference.current);
        setSuccessMessage("Password updated");
        successTimerReference.current = setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error_) {
        setSubmitError(
          error_ instanceof ApiError
            ? error_.message
            : "Password change failed. Please try again.",
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>Change your account password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} role="form" aria-label="Change password">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                onBlur={() => touch("currentPassword")}
                aria-invalid={!!visibleError("currentPassword")}
                autoComplete="current-password"
              />
              {visibleError("currentPassword") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("currentPassword")}
                </p>
              )}
            </div>
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
            {successMessage && (
              <p role="status" className="text-sm text-[hsl(var(--success))]">
                {successMessage}
              </p>
            )}
            <Button
              type="submit"
              disabled={
                !currentPassword || !newPassword || !confirmPassword || !isFormValid || isPending
              }
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
