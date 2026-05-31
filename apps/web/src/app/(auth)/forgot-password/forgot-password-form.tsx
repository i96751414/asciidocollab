"use client";

import { useState, useTransition } from "react";
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
import { useTouchedFields } from "@/hooks/use-touched-fields";

const FIELDS = ["email"] as const;
type FieldName = (typeof FIELDS)[number];

const schema = z.object({
  email: z.email("Please enter a valid email address"),
});

/** Form that lets a user request a password reset email. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { touch, touchAll, isTouched } = useTouchedFields(FIELDS);

  const validation = schema.safeParse({ email });
  const isFormValid = validation.success;
  const fieldErrors = validation.success ? {} : z.flattenError(validation.error).fieldErrors;

  function visibleError(field: FieldName): string | undefined {
    if (!isTouched(field)) return undefined;
    return fieldErrors[field]?.[0];
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    touchAll();

    if (!isFormValid) return;

    startTransition(async () => {
      try {
        await authApi.requestPasswordReset(email);
        setSubmitted(true);
      } catch (error_) {
        setSubmitError(
          error_ instanceof ApiError
            ? error_.message
            : "Something went wrong. Please try again.",
        );
      }
    });
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong>{email}</strong>, a password reset link has been sent.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} role="form" aria-label="Forgot password">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => touch("email")}
                aria-invalid={!!visibleError("email")}
                autoComplete="email"
              />
              {visibleError("email") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("email")}
                </p>
              )}
            </div>
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!isFormValid || isPending}>
              {isPending ? "Sending…" : "Send reset link"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
