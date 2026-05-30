"use client";

import { useState, useTransition } from "react";
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
import { authApi, ApiError } from "@/lib/api";

/** Properties for the RegisterForm component. */
interface RegisterFormProperties {
  /** True when no users exist yet — shows first-run messaging. */
  isFirstRun: boolean;
}

/**
 * First-run registration form.
 */
export function RegisterForm({ isFirstRun }: RegisterFormProperties) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function validate() {
    const errors: Record<string, string> = {};
    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }

    return errors;
  }

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    startTransition(async () => {
      try {
        await authApi.register(email, password, displayName);
        router.push("/dashboard");
      } catch (error_) {
        if (error_ instanceof ApiError && error_.status === 403) {
          setError("Registration is closed");
        } else {
          setError(
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
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="new-password"
              />
              {fieldErrors.password && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create account"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
