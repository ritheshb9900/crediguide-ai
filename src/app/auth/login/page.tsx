"use client";

import React, { useState, useEffect, Suspense, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth, type UserRole } from "@/contexts/auth-context";
import { sanitizeReturnUrl } from "@/proxy";

/**
 * Safely resolves useRouter() with graceful fallback for environments
 * without an AppRouter context (e.g. Node.js unit tests using renderToStaticMarkup).
 */
function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

/**
 * Safely resolves useSearchParams() with graceful fallback for environments
 * without an AppRouter context.
 */
function useSafeSearchParams() {
  try {
    return useSearchParams();
  } catch {
    return null;
  }
}

/**
 * Validates that a sanitized path strictly belongs to an allowed route prefix.
 * Enforces strict path-boundary delimiters ('/', '?', '#', or exact match)
 * to prevent path-prefix confusion attacks (e.g. /dashboard-evil matching /dashboard).
 */
export function isAllowedRolePath(path: string, allowedPrefix: string): boolean {
  return (
    path === allowedPrefix ||
    path.startsWith(allowedPrefix + "/") ||
    path.startsWith(allowedPrefix + "?") ||
    path.startsWith(allowedPrefix + "#")
  );
}

/**
 * Determines the authoritative redirect destination based on the user's verified role
 * and an optional sanitized returnUrl.
 *
 * Security Invariants:
 * 1. An applicant can never be redirected to an officer or admin portal route.
 * 2. An officer can never be redirected to an admin portal route.
 * 3. All returnUrls are sanitized against protocol-relative and external open redirects.
 * 4. Fallback defaults to the role's primary landing destination.
 * 5. Role routes enforce strict path boundaries to prevent path-prefix confusion.
 */
export function getRoleRedirectDestination(role: UserRole, returnUrl?: string | null): string {
  if (returnUrl) {
    const sanitized = sanitizeReturnUrl(returnUrl);

    if (role === "LOAN_APPLICANT") {
      if (
        isAllowedRolePath(sanitized, "/dashboard") ||
        isAllowedRolePath(sanitized, "/applications")
      ) {
        return sanitized;
      }
    } else if (role === "BANK_OFFICER") {
      if (
        isAllowedRolePath(sanitized, "/officer") ||
        isAllowedRolePath(sanitized, "/dashboard")
      ) {
        return sanitized;
      }
    } else if (role === "BANK_ADMIN") {
      if (
        isAllowedRolePath(sanitized, "/admin") ||
        isAllowedRolePath(sanitized, "/officer") ||
        isAllowedRolePath(sanitized, "/dashboard")
      ) {
        return sanitized;
      }
    }
  }

  // Authoritative default destinations by role
  switch (role) {
    case "BANK_ADMIN":
      return "/admin";
    case "BANK_OFFICER":
      return "/officer";
    case "LOAN_APPLICANT":
    default:
      return "/dashboard";
  }
}

export function LoginForm() {
  const { user, isAuthenticated, isLoading, login } = useAuth();
  const router = useSafeRouter();
  const searchParams = useSafeSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});

  const rawReturnUrl = searchParams?.get("returnUrl");

  // Redirect already-authenticated users immediately to their designated portal
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const destination = getRoleRedirectDestination(user.role, rawReturnUrl);
      router?.replace(destination);
    }
  }, [isLoading, isAuthenticated, user, router, rawReturnUrl]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || isLoading) return;

    // Reset feedback
    setErrorMessage(null);
    const errors: { email?: string; password?: string } = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errors.email = "Email address is required.";
    } else if (!trimmedEmail.includes("@") || trimmedEmail.length < 5) {
      errors.email = "Please enter a valid email address.";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    try {
      const result = await login({ email: trimmedEmail, password });

      if (result.success) {
        // Navigation will be automatically executed by the useEffect upon AuthUser context update,
        // but we can also eagerly push once user role is available.
        if (user) {
          const destination = getRoleRedirectDestination(user.role, rawReturnUrl);
          router?.replace(destination);
        }
      } else {
        setErrorMessage(result.error || "Authentication failed. Please check your credentials.");
        setIsSubmitting(false);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected network error occurred. Please try again.";
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  };

  // If already authenticated and awaiting redirect, show minimal transition state
  if (!isLoading && isAuthenticated && user) {
    return (
      <AuthCard
        title="Welcome back"
        description="Redirecting you to your portal..."
        badgeText="Redirecting"
      >
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading your profile...</p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Sign in to CrediGuide"
      description="Access your enterprise lending intelligence portal"
      badgeText="Enterprise Portal"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Link
            href="/auth/forgot-password"
            className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
          >
            Forgot password?
          </Link>
          <div>
            <span>New user? </span>
            <Link
              href="/auth/register"
              className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
            >
              Register here
            </Link>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Top-Level Authentication Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Email Field */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="email" required>
            Email address
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (validationErrors.email) {
                setValidationErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            disabled={isSubmitting || isLoading}
            hasError={Boolean(validationErrors.email)}
            aria-describedby={validationErrors.email ? "email-error" : undefined}
            required
          />
          {validationErrors.email && (
            <p id="email-error" className="text-xs text-red-600 dark:text-red-400" role="alert">
              {validationErrors.email}
            </p>
          )}
        </div>

        {/* Password Field with Show/Hide Toggle */}
        <div className="space-y-1.5 text-left">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" required>
              Password
            </Label>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (validationErrors.password) {
                  setValidationErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              disabled={isSubmitting || isLoading}
              hasError={Boolean(validationErrors.password)}
              aria-describedby={validationErrors.password ? "password-error" : undefined}
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isSubmitting || isLoading}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded p-1 transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {validationErrors.password && (
            <p id="password-error" className="text-xs text-red-600 dark:text-red-400" role="alert">
              {validationErrors.password}
            </p>
          )}
        </div>

        {/* Submit Action Button */}
        <Button
          type="submit"
          disabled={isSubmitting || isLoading}
          className="w-full font-semibold shadow-sm cursor-pointer mt-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Authenticating...
            </>
          ) : (
            "Sign In"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

export function LoginLoadingFallback() {
  return (
    <AuthCard
      title="Sign in to CrediGuide"
      description="Access your enterprise lending intelligence portal"
      badgeText="Enterprise Portal"
    >
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        <div className="h-10 bg-blue-200 dark:bg-blue-900/40 rounded-lg w-full" />
      </div>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<LoginLoadingFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
