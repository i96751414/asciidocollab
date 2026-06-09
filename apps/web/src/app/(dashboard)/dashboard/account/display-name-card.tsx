"use client";

import { useRef, useState, useTransition } from "react";
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
import { Avatar } from "@/components/avatar";
import { DICEBEAR_STYLES, DEFAULT_AVATAR_STYLE } from "@/lib/avatars";
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
  avatarKey?: string | null;
}

/** Card allowing the user to update their display name and choose an avatar style and variant. */
export function DisplayNameCard({ displayName: initialDisplayName, avatarKey: initialAvatarKey = null }: DisplayNameCardProperties) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [selectedAvatarKey, setSelectedAvatarKey] = useState<string>(initialAvatarKey ?? DEFAULT_AVATAR_STYLE);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const successTimerReference = useRef<ReturnType<typeof setTimeout>>(null);
  const { touch, isTouched } = useTouchedFields(FIELDS);

  const colonIndex = selectedAvatarKey.indexOf(':');
  const selectedStyle = colonIndex === -1 ? selectedAvatarKey : selectedAvatarKey.slice(0, colonIndex);
  const selectedVariant = colonIndex === -1 ? null : selectedAvatarKey.slice(colonIndex + 1);
  const variants = DICEBEAR_STYLES[selectedStyle]?.variants ?? [];

  const validation = schema.safeParse({ displayName });
  const isFormValid = validation.success;
  const fieldErrors = validation.success ? {} : z.flattenError(validation.error).fieldErrors;
  const isUnchanged = displayName === initialDisplayName && selectedAvatarKey === (initialAvatarKey ?? DEFAULT_AVATAR_STYLE);

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
        await authApi.updateProfile({ displayName, avatarKey: selectedAvatarKey });
        if (successTimerReference.current) clearTimeout(successTimerReference.current);
        setSuccessMessage("Saved");
        // Re-run the server layout so the top-right menu (name + avatar) reflects the change immediately.
        router.refresh();
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
        <CardDescription>Update your display name and choose an avatar.</CardDescription>
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

            <div className="space-y-2">
              <Label>Avatar style</Label>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {Object.entries(DICEBEAR_STYLES).map(([key, entry]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selectedStyle === key}
                    onClick={() => setSelectedAvatarKey(key)}
                    className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 text-[10px] w-14 flex-shrink-0 transition-colors hover:bg-accent ${
                      selectedStyle === key ? "border-primary bg-accent" : "border-border"
                    }`}
                  >
                    <Avatar avatarKey={key} displayName={displayName || initialDisplayName} size={32} />
                    <span className="truncate w-full text-center leading-none">{entry.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {variants.length > 0 && (
              <div className="space-y-2">
                <Label>Variant</Label>
                <div className="flex flex-wrap gap-2">
                  {variants.map((variant, index) => (
                    <button
                      key={variant.id}
                      type="button"
                      aria-label={`Variant ${index + 1}`}
                      aria-pressed={selectedVariant === variant.id}
                      onClick={() => setSelectedAvatarKey(`${selectedStyle}:${variant.id}`)}
                      className={`rounded-md border p-1.5 transition-colors hover:bg-accent ${
                        selectedVariant === variant.id ? "border-primary bg-accent" : "border-border"
                      }`}
                    >
                      <Avatar avatarKey={`${selectedStyle}:${variant.id}`} displayName={displayName || initialDisplayName} size={40} />
                    </button>
                  ))}
                </div>
              </div>
            )}

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
