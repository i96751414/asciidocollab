"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
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
import { authApi, adminApi, ApiError } from "@/lib/api";
import { isInternalPath } from "@/lib/redirect";

const loginSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/** Properties for the LoginForm component. */
interface LoginFormProperties {
  /** Path to redirect to after successful login. Falls back to /dashboard if unsafe. */
  redirectTo: string;
  /** Shows a session-expired notice above the form. */
  showExpiredNotice?: boolean;
}

/**
 * Client-side login form with error and rate-limit feedback.
 */
export function LoginForm({ redirectTo, showExpiredNotice }: LoginFormProperties) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);
  const [openRegistration, setOpenRegistration] = useState(false);
  const [isPending, startTransition] = useTransition();

  const safeRedirect = isInternalPath(redirectTo) ? redirectTo : "/dashboard";

  useEffect(() => {
    adminApi.getOpenRegistrationStatus().then((d) => setOpenRegistration(d.openRegistration)).catch(() => {});
  }, []);

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLockoutMessage(null);
    setFieldErrors({});

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs = z.flattenError(parsed.error).fieldErrors;
      setFieldErrors({
        email: errs.email?.[0],
        password: errs.password?.[0],
      });
      return;
    }

    startTransition(async () => {
      try {
        await authApi.login(email, password);
        router.push(safeRedirect);
      } catch (error_) {
        if (error_ instanceof ApiError && error_.status === 429) {
          const minutes = error_.retryAfter
            ? Math.ceil(error_.retryAfter / 60)
            : 15;
          setLockoutMessage(
            `Too many failed attempts — please try again in ${minutes} minutes`
          );
        } else {
          setError("Invalid email or password");
        }
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Sign in to your account to continue</CardDescription>
      </CardHeader>
      <CardContent>
        {showExpiredNotice && (
          <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
            Your session has expired. Please sign in again.
          </div>
        )}
        <form onSubmit={handleSubmit} role="form" aria-label="Sign in">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
              {fieldErrors.email && (
                <p role="alert" className="text-sm text-destructive">
                  {fieldErrors.email}
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
                autoComplete="current-password"
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
            {lockoutMessage && (
              <p role="alert" className="text-sm text-destructive">
                {lockoutMessage}
              </p>
            )}
            <div className="flex items-center justify-end">
              <Link href="/forgot-password" className="text-sm text-muted-foreground hover:underline">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign in"}
            </Button>
            {openRegistration && (
              <p className="text-center text-sm text-muted-foreground">
                No account?{" "}
                <Link href="/register" className="underline hover:text-foreground">
                  Create an account
                </Link>
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
