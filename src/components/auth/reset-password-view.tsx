"use client";

import React, { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { PasswordStrength, evaluatePasswordStrength } from "@/components/auth/password-strength";
import { useAuth } from "@/contexts/auth-context";
import { getRoleRedirectDestination } from "@/lib/auth/redirects";
import { cn } from "@/lib/utils";

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
 * Validates candidate reset token format.
 * Must be a non-empty string of at least 16 characters.
 */
export function isValidResetToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  return token.trim().length >= 16;
}

export interface ResetPasswordValidationErrors {
  password?: string;
  confirmPassword?: string;
}

/**
 * Validates new password and confirmation matching the backend PasswordSchema.
 */
export function validateResetPasswordInput(
  password: string,
  confirmPassword: string
): ResetPasswordValidationErrors {
  const errors: ResetPasswordValidationErrors = {};

  if (!password) {
    errors.password = "Password is required.";
  } else {
    const strength = evaluatePasswordStrength(password);
    if (!strength.isValid) {
      if (password.length < 8 || password.length > 128) {
        errors.password = "Password must be between 8 and 128 characters long.";
      } else {
        errors.password = "Password does not satisfy all complexity requirements.";
      }
    }
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Please confirm your new password.";
  } else if (confirmPassword !== password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

/**
 * Builds the exact API payload for POST /api/auth/reset-password.
 * CRITICAL SECURITY INVARIANT:
 * - Sends strictly { token, password }.
 * - Excludes confirmPassword.
 * - Never includes extraneous fields.
 */
export function buildResetPasswordPayload(
  token: string,
  password: string
): { token: string; password: string } {
  return {
    token: token.trim(),
    password,
  };
}

export interface ResetPasswordFormProps {
  tokenOverride?: string;
  onSuccess?: () => void;
  submitFn?: (payload: {
    token: string;
    password: string;
  }) => Promise<{ status: number; data: unknown }>;
}

export function ResetPasswordForm({
  tokenOverride,
  onSuccess,
  submitFn,
}: ResetPasswordFormProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useSafeRouter();
  const searchParams = useSafeSearchParams();

  // Read token from query parameters or override prop
  const rawToken =
    tokenOverride !== undefined
      ? tokenOverride
      : searchParams?.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ResetPasswordValidationErrors>({});
  const [isResetSuccess, setIsResetSuccess] = useState(false);

  const rawReturnUrl = searchParams?.get("returnUrl");

  // Redirect already-authenticated users immediately to their designated portal
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const destination = getRoleRedirectDestination(user.role, rawReturnUrl);
      router?.replace(destination);
    }
  }, [isLoading, isAuthenticated, user, router, rawReturnUrl]);

  // Clean raw token from browser URL upon successful reset to prevent leakage in history/referrers
  useEffect(() => {
    if (isResetSuccess && typeof window !== "undefined" && window.history?.replaceState) {
      window.history.replaceState(null, "", "/auth/reset-password");
    }
  }, [isResetSuccess]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || isLoading) return;

    setErrorMessage(null);

    // 1. Client-Side Input Validation
    const errors = validateResetPasswordInput(password, confirmPassword);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    // 2. Token Format Guard
    if (!isValidResetToken(rawToken)) {
      setErrorMessage("This password reset link is invalid or incomplete. Please request a new link.");
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    // 3. Build Minimal Sanitized Payload
    const payload = buildResetPasswordPayload(rawToken, password);

    try {
      let status: number;
      let data: unknown;

      if (submitFn) {
        const customRes = await submitFn(payload);
        status = customRes.status;
        data = customRes.data;
      } else {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        status = res.status;
        data = await res.json().catch(() => null);
      }

      const responseBody = data as {
        success?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (status === 200 && responseBody?.success) {
        setIsResetSuccess(true);
        onSuccess?.();
      } else {
        // Map backend error contracts
        if (responseBody?.error === "INVALID_OR_EXPIRED_TOKEN") {
          setErrorMessage(
            "This password reset link is invalid, expired, or has already been used. Please request a new link."
          );
        } else if (responseBody?.error === "VALIDATION_ERROR") {
          setErrorMessage(
            responseBody?.message || "Password does not satisfy enterprise complexity requirements."
          );
        } else if (status === 403 || responseBody?.error === "CSRF_ERROR") {
          setErrorMessage("Security verification failed. Please refresh the page and try again.");
        } else if (status === 415 || responseBody?.error === "UNSUPPORTED_MEDIA_TYPE") {
          setErrorMessage("Unsupported request format. Please try again.");
        } else {
          setErrorMessage(
            responseBody?.message || "An unexpected error occurred while resetting your password. Please try again."
          );
        }
        setIsSubmitting(false);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "An unexpected network error occurred. Please try again.";
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

  // Success Confirmation View (Post-Reset)
  if (isResetSuccess) {
    return (
      <AuthCard
        title="Password reset complete"
        description="Your account password has been successfully updated."
        badgeText="Password Updated"
        footer={
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Need assistance? Contact your bank administrator or support team.
          </p>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Password Successfully Updated
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              All previous active sessions across all devices have been terminated for your security. Please sign in with your new password to continue.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/auth/login"
              className={cn(buttonVariants(), "w-full font-semibold shadow-sm cursor-pointer")}
            >
              Sign In with New Password
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  // Missing or Malformed Token Guard
  if (!isValidResetToken(rawToken)) {
    return (
      <AuthCard
        title="Invalid Reset Link"
        description="This password reset link is invalid, incomplete, or has expired."
        badgeText="Invalid Link"
        footer={
          <div className="flex items-center justify-center w-full text-xs text-slate-500 dark:text-slate-400">
            <span>Remember your password? </span>
            <Link
              href="/auth/login"
              className="ml-1 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
            >
              Sign in here
            </Link>
          </div>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 mx-auto">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Security Link Expired or Incomplete
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Password reset links expire after 15 minutes and can only be used once. Please request a fresh reset link to update your password.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href="/auth/forgot-password"
              className={cn(buttonVariants(), "w-full font-semibold shadow-sm cursor-pointer")}
            >
              Request New Reset Link
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set new password"
      description="Enter your new secure password below to regain account access"
      badgeText="Password Reset"
      footer={
        <div className="flex items-center justify-center w-full text-xs text-slate-500 dark:text-slate-400">
          <span>Remember your password? </span>
          <Link
            href="/auth/login"
            className="ml-1 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
          >
            Sign in here
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Top-Level Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <span>{errorMessage}</span>
              {errorMessage.includes("request a new link") && (
                <div>
                  <Link
                    href="/auth/forgot-password"
                    className="font-medium underline hover:text-red-900 dark:hover:text-red-200"
                  >
                    Click here to request a new link
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* New Password Field with Show/Hide Toggle */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="password" required>
            New password
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (validationErrors.password) {
                  setValidationErrors((prev) => ({ ...prev, password: undefined }));
                }
                if (errorMessage) setErrorMessage(null);
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

          {/* Live Password Strength Meter */}
          <div className="pt-1">
            <PasswordStrength password={password} />
          </div>
        </div>

        {/* Confirm Password Field with Show/Hide Toggle */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="confirmPassword" required>
            Confirm new password
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (validationErrors.confirmPassword) {
                  setValidationErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }
                if (errorMessage) setErrorMessage(null);
              }}
              disabled={isSubmitting || isLoading}
              hasError={Boolean(validationErrors.confirmPassword)}
              aria-describedby={
                validationErrors.confirmPassword ? "confirmPassword-error" : undefined
              }
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isSubmitting || isLoading}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded p-1 transition-colors"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {validationErrors.confirmPassword && (
            <p
              id="confirmPassword-error"
              className="text-xs text-red-600 dark:text-red-400"
              role="alert"
            >
              {validationErrors.confirmPassword}
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
              Updating Password...
            </>
          ) : (
            "Reset Password"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

export function ResetPasswordLoadingFallback() {
  return (
    <AuthCard
      title="Set new password"
      description="Enter your new secure password below to regain account access"
      badgeText="Password Reset"
    >
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        <div className="h-10 bg-blue-200 dark:bg-blue-900/40 rounded-lg w-full" />
      </div>
    </AuthCard>
  );
}
