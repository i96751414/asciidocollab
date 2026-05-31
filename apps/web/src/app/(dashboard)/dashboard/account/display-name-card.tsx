"use client";

import { useRef, useState, useTransition } from "react";
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

const FIELDS = ["displayName"] as const;
type FieldName = (typeof FIELDS)[number];

const schema = z.object({
  displayName: z
    .string()
    .min(1, "Display name cannot be empty")
    .max(100, "Display name must be at most 100 characters"),
});

interface DisplayNameCardProperties {
  displayName: string;
}

/** Card that lets an authenticated user update their display name. */
export function DisplayNameCard({ displayName: initialDisplayName }: DisplayNameCardProperties) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const successTimerReference = useRef<ReturnType<typeof setTimeout>>(null);
  const { touch, isTouched } = useTouchedFields(FIELDS);

  const validation = schema.safeParse({ displayName });
  const isFormValid = validation.success;
  const fieldErrors = validation.success ? {} : z.flattenError(validation.error).fieldErrors;
  const isUnchanged = displayName === initialDisplayName;

  function visibleError(field: FieldName): string | undefined {
    if (!isTouched(field)) return undefined;
    return fieldErrors[field]?.[0];
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!isFormValid || isUnchanged) return;

    startTransition(async () => {
      try {
        await authApi.updateDisplayName(displayName);
        if (successTimerReference.current) clearTimeout(successTimerReference.current);
        setSuccessMessage("Saved");
        successTimerReference.current = setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error_) {
        setSubmitError(
          error_ instanceof ApiError
            ? error_.message
            : "Failed to update display name. Please try again.",
        );
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display Name</CardTitle>
        <CardDescription>Update your display name.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} role="form" aria-label="Update display name">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="displayName">Display name</Label>
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
            {submitError && (
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            {successMessage && (
              <p role="status" className="text-sm text-green-700">
                {successMessage}
              </p>
            )}
            <Button
              type="submit"
              disabled={isUnchanged || !displayName || !isFormValid || isPending}
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
