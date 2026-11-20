"use client";

import React, { useState, useEffect, Suspense, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Clock, Loader2, Mail } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { getRoleRedirectDestination } from "@/app/auth/login/page";
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
 * Validates the email address for password reset requests client-side
 * before dispatching a network call.
 */
export function validateForgotPasswordEmail(email: string): string | null {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!trimmed) {
    return "Email address is required.";
  }
  // Standard RFC 5322 regex matching NormalizedEmailSchema
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

/**
 * Normalizes email address to lowercase and trimmed string.
 */
export function normalizeForgotPasswordEmail(email: string): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Builds the exact API payload for POST /api/auth/forgot-password.
 * Strictly sends only { email }.
 */
export function buildForgotPasswordPayload(email: string): { email: string } {
  return {
    email: normalizeForgotPasswordEmail(email),
  };
}

export interface ForgotPasswordFormProps {
  onSuccess?: (email: string) => void;
  submitFn?: (payload: {
    email: string;
  }) => Promise<{ status: number; data: unknown }>;
}

export function ForgotPasswordForm({
  onSuccess,
  submitFn,
}: ForgotPasswordFormProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useSafeRouter();
  const searchParams = useSafeSearchParams();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

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

    setErrorMessage(null);

    // 1. Client-Side Validation
    const error = validateForgotPasswordEmail(email);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    const payload = buildForgotPasswordPayload(email);

    try {
      let status: number;
      let data: unknown;

      if (submitFn) {
        const customRes = await submitFn(payload);
        status = customRes.status;
        data = customRes.data;
      } else {
        const res = await fetch("/api/auth/forgot-password", {
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
        setSubmittedEmail(payload.email);
        onSuccess?.(payload.email);
      } else {
        // Map backend error contracts
        if (status === 429 || responseBody?.error === "RATE_LIMIT_EXCEEDED") {
          setErrorMessage(
            responseBody?.message ||
              "Too many password reset requests. Please wait a few minutes before trying again."
          );
        } else if (
          status === 400 ||
          responseBody?.error === "VALIDATION_ERROR"
        ) {
          setErrorMessage(
            responseBody?.message || "Invalid email address format."
          );
        } else if (status === 403 || responseBody?.error === "CSRF_ERROR") {
          setErrorMessage(
            "Security verification failed. Please refresh the page and try again."
          );
        } else if (
          status === 415 ||
          responseBody?.error === "UNSUPPORTED_MEDIA_TYPE"
        ) {
          setErrorMessage("Unsupported request format. Please try again.");
        } else if (
          status === 503 ||
          responseBody?.error === "SERVICE_UNAVAILABLE"
        ) {
          setErrorMessage(
            "Password reset service is temporarily unavailable. Please try again later."
          );
        } else {
          setErrorMessage(
            responseBody?.message ||
              "Unable to process your request at this time. Please try again later."
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
          <Loader2
            className="h-6 w-6 animate-spin text-blue-600"
            aria-hidden="true"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Loading your profile...
          </p>
        </div>
      </AuthCard>
    );
  }

  // Anti-Enumeration Generic Confirmation View (Post-Submission)
  if (submittedEmail) {
    return (
      <AuthCard
        title="Check your email"
        description="Password reset instructions have been dispatched."
        badgeText="Instructions Sent"
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
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto">
            <Mail className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Instructions Sent
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              If an account is registered with{" "}
              <strong className="text-slate-900 dark:text-slate-100">
                {submittedEmail}
              </strong>
              , you will receive password reset instructions shortly.
            </p>
          </div>

          {/* Security Expiration Notice Box */}
          <div className="rounded-lg p-3 text-xs flex items-start gap-2.5 text-left border bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
            <Clock
              className="h-4 w-4 shrink-0 mt-0.5 text-slate-500 dark:text-slate-400"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Security Expiration Notice
              </p>
              <p className="leading-relaxed">
                The reset link remains active for 15 minutes. If you do not see
                the email, please check your spam or junk folder.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Link
              href="/auth/login"
              className={cn(
                buttonVariants(),
                "w-full font-semibold shadow-sm cursor-pointer"
              )}
            >
              Return to Sign In
            </Link>

            <button
              type="button"
              onClick={() => {
                setSubmittedEmail(null);
                setEmail("");
                setErrorMessage(null);
                setValidationError(null);
                setIsSubmitting(false);
              }}
              className="w-full text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 py-1 transition-colors cursor-pointer"
            >
              Try another email address
            </button>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your registered email address to receive password reset instructions"
      badgeText="Account Recovery"
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
              if (validationError) setValidationError(null);
              if (errorMessage) setErrorMessage(null);
            }}
            disabled={isSubmitting || isLoading}
            hasError={Boolean(validationError)}
            aria-describedby={validationError ? "email-error" : undefined}
            required
          />
          {validationError && (
            <p
              id="email-error"
              className="text-xs text-red-600 dark:text-red-400"
              role="alert"
            >
              {validationError}
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
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
              Sending Instructions...
            </>
          ) : (
            "Send Reset Link"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordLoadingFallback() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your registered email address to receive password reset instructions"
      badgeText="Account Recovery"
    >
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        <div className="h-10 bg-blue-200 dark:bg-blue-900/40 rounded-lg w-full" />
      </div>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<ForgotPasswordLoadingFallback />}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
