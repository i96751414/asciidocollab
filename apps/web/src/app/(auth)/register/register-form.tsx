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
import type { PasswordPolicyDto } from "@asciidocollab/shared";

type FieldName = "displayName" | "email" | "password" | "confirmPassword";

function buildRegisterSchema(policy: PasswordPolicyDto) {
  let passwordSchema = z.string().min(
    policy.minLength,
    `Password must be at least ${policy.minLength} characters`,
  );
  if (policy.requireUppercase) {
    passwordSchema = passwordSchema.regex(/[A-Z]/, "Password must contain at least one uppercase letter");
  }
  if (policy.requireLowercase) {
    passwordSchema = passwordSchema.regex(/[a-z]/, "Password must contain at least one lowercase letter");
  }
  if (policy.requireDigits) {
    passwordSchema = passwordSchema.regex(/\d/, "Password must contain at least one digit");
  }
  if (policy.requireSymbols) {
    passwordSchema = passwordSchema.regex(/[^A-Za-z0-9]/, "Password must contain at least one symbol");
  }
  return z
    .object({
      displayName: z.string().min(1, "Display name is required").max(100, "Display name must be at most 100 characters"),
      email: z.string().email("Please enter a valid email address"),
      password: passwordSchema,
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    });
}

/** Properties for the RegisterForm component. */
interface RegisterFormProperties {
  /** True when no users exist yet — shows first-run messaging. */
  isFirstRun: boolean;
  /** Password policy fetched from the server — used to build client-side validation. */
  passwordPolicy: PasswordPolicyDto;
}

/**
 * First-run registration form.
 */
export function RegisterForm({ isFirstRun, passwordPolicy }: RegisterFormProperties) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const schema = useMemo(() => buildRegisterSchema(passwordPolicy), [passwordPolicy]);

  const validation = schema.safeParse({ displayName, email, password, confirmPassword });
  const isFormValid = validation.success;
  const allFieldErrors = validation.success
    ? {}
    : validation.error.flatten().fieldErrors;

  function visibleError(field: FieldName): string | undefined {
    if (!touched[field]) return undefined;
    if (field === "confirmPassword" && allFieldErrors.password?.length) return undefined;
    return allFieldErrors[field]?.[0];
  }

  function touch(field: FieldName) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function touchAll() {
    setTouched({ displayName: true, email: true, password: true, confirmPassword: true });
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    touchAll();

    if (!isFormValid) return;

    startTransition(async () => {
      try {
        await authApi.register(email, password, displayName);
        router.push("/dashboard");
      } catch (error_) {
        if (error_ instanceof ApiError && error_.status === 403) {
          setSubmitError("Registration is closed");
        } else {
          setSubmitError(
            error_ instanceof ApiError
              ? error_.message
              : "Registration failed. Please try again."
          );
        }
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isFirstRun ? "Set up your account" : "Create account"}
        </CardTitle>
        <CardDescription>
          {isFirstRun
            ? "Create the first admin account to get started"
            : "Register for access"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} role="form" aria-label="Register">
          <div className="space-y-4">
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
              <p role="alert" className="text-sm text-destructive">
                {submitError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!isFormValid || isPending}>
              {isPending ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
