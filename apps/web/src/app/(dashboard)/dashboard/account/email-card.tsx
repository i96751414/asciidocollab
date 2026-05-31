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

const FIELDS = ["newEmail"] as const;
type FieldName = (typeof FIELDS)[number];

const schema = z.object({
  newEmail: z.email("Please enter a valid email address"),
});

/** Props for the EmailCard component. */
interface EmailCardProperties {
  /** The user's current email address. */
  email: string;
}

/** Card that lets an authenticated user request an email address change. */
export function EmailCard({ email: currentEmail }: EmailCardProperties) {
  const [newEmail, setNewEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { touch, isTouched } = useTouchedFields(FIELDS);

  const validation = schema.safeParse({ newEmail });
  const isFormValid = validation.success;
  const fieldErrors = validation.success ? {} : z.flattenError(validation.error).fieldErrors;
  const isUnchanged = newEmail === currentEmail;

  function visibleError(field: FieldName): string | undefined {
    if (!isTouched(field)) return undefined;
    return fieldErrors[field]?.[0];
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!isFormValid || isUnchanged) return;

    startTransition(async () => {
      try {
        await authApi.requestEmailChange(newEmail);
        setSubmittedEmail(newEmail);
        setSubmitted(true);
      } catch (error_) {
        setSubmitError(
          error_ instanceof ApiError
            ? error_.message
            : "Failed to request email change. Please try again.",
        );
      }
    });
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Check your email at <strong>{submittedEmail}</strong> to confirm the change.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          Current email: <strong>{currentEmail}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} role="form" aria-label="Change email">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="newEmail">New email address</Label>
              <Input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                onBlur={() => touch("newEmail")}
                aria-invalid={!!visibleError("newEmail")}
                autoComplete="email"
              />
              {visibleError("newEmail") && (
                <p role="alert" className="text-sm text-destructive">
                  {visibleError("newEmail")}
                </p>
              )}
            </div>
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <Button
              type="submit"
              disabled={isUnchanged || !newEmail || !isFormValid || isPending}
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
