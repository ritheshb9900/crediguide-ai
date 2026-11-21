"use client";

import React, { useState, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
  Mail,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { getRoleRedirectDestination } from "@/lib/auth/redirects";
import { cn } from "@/lib/utils";

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

export type VerificationState =
  | "INITIAL_IDLE"
  | "VERIFYING"
  | "VERIFIED_SUCCESS"
  | "EXPIRED_OR_USED"
  | "TRANSIENT_ERROR"
  | "RESEND_FORM"
  | "RESEND_SUCCESS";

/**
 * Validates candidate verification token format.
 * Must be a non-empty string of at least 16 characters.
 */
export function isValidVerificationToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") {
    return false;
  }
  return token.trim().length >= 16;
}

/**
 * Validates email address for resend verification requests client-side.
 */
export function validateResendEmail(email: string): string | null {
  const trimmed = typeof email === "string" ? email.trim() : "";
  if (!trimmed) {
    return "Email address is required.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

/**
 * Normalizes email address to lowercase and trimmed string.
 */
export function normalizeResendEmail(email: string): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Builds the exact API payload for POST /api/auth/verify-email.
 * Strictly sends { token }.
 */
export function buildVerifyPayload(token: string): { token: string } {
  return {
    token: token.trim(),
  };
}

/**
 * Builds the exact API payload for POST /api/auth/resend-verification.
 * Strictly sends { email }.
 */
export function buildResendPayload(email: string): { email: string } {
  return {
    email: normalizeResendEmail(email),
  };
}

export interface VerifyEmailContentProps {
  tokenOverride?: string;
  emailOverride?: string;
  verifyFn?: (payload: { token: string }) => Promise<{ status: number; data: unknown }>;
  resendFn?: (payload: { email: string }) => Promise<{ status: number; data: unknown }>;
  onVerifiedSuccess?: () => void;
  onResendSuccess?: (email: string) => void;
}

export function VerifyEmailContent({
  tokenOverride,
  emailOverride,
  verifyFn,
  resendFn,
  onVerifiedSuccess,
  onResendSuccess,
}: VerifyEmailContentProps) {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const searchParams = useSafeSearchParams();

  // Extract initial params from props or searchParams
  const initialRawToken =
    tokenOverride !== undefined
      ? tokenOverride
      : searchParams?.get("token") || "";

  const initialRawEmail =
    emailOverride !== undefined
      ? emailOverride
      : searchParams?.get("email") || "";

  // In-memory ref for token storage (never in localStorage/cookies/sessionStorage)
  const tokenRef = useRef<string>(initialRawToken);

  // Single-execution guard to prevent React 19 StrictMode duplicate execution
  const hasExecutedVerificationRef = useRef(false);
  const isExecutingRef = useRef(false);

  const hasInitialValidToken = isValidVerificationToken(initialRawToken);

  const [state, setState] = useState<VerificationState>(() => {
    if (hasInitialValidToken) {
      return "VERIFYING";
    }
    return "RESEND_FORM";
  });

  const [resendEmail, setResendEmail] = useState(initialRawEmail);
  const [resendValidationError, setResendValidationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [submittedResendEmail, setSubmittedResendEmail] = useState<string | null>(null);

  // Remove token and email from browser URL immediately on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.history?.replaceState) {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has("token")) {
        url.searchParams.delete("token");
        changed = true;
      }
      if (url.searchParams.has("email")) {
        url.searchParams.delete("email");
        changed = true;
      }
      if (changed) {
        window.history.replaceState(null, "", url.pathname);
      }
    }
  }, []);

  // Verification execution worker
  const executeVerification = async (tokenCandidate: string) => {
    if (!tokenCandidate || isExecutingRef.current) return;

    isExecutingRef.current = true;
    setErrorMessage(null);
    setState("VERIFYING");

    const payload = buildVerifyPayload(tokenCandidate);

    try {
      let status: number;
      let data: unknown;

      if (verifyFn) {
        const customRes = await verifyFn(payload);
        status = customRes.status;
        data = customRes.data;
      } else {
        const res = await fetch("/api/auth/verify-email", {
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
        setState("VERIFIED_SUCCESS");
        // If an authenticated session exists, refresh user to update isEmailVerified in context
        if (isAuthenticated && refreshUser) {
          refreshUser().catch(() => {
            // Non-blocking background sync
          });
        }
        onVerifiedSuccess?.();
      } else if (responseBody?.error === "INVALID_OR_EXPIRED_TOKEN") {
        setState("EXPIRED_OR_USED");
      } else if (responseBody?.error === "CSRF_ERROR" || status === 403) {
        setErrorMessage("Security verification failed. Please refresh the page and try again.");
        setState("TRANSIENT_ERROR");
      } else if (responseBody?.error === "UNSUPPORTED_MEDIA_TYPE" || status === 415) {
        setErrorMessage("Unsupported request format. Please try again.");
        setState("TRANSIENT_ERROR");
      } else {
        setErrorMessage(
          responseBody?.message ||
            "An internal error occurred while verifying your email. Please try again."
        );
        setState("TRANSIENT_ERROR");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected network error occurred while verifying your email.";
      setErrorMessage(msg);
      setState("TRANSIENT_ERROR");
    } finally {
      isExecutingRef.current = false;
    }
  };

  // Auto-verify on mount if initial token is valid, guarding against StrictMode duplicate requests
  useEffect(() => {
    if (
      !hasExecutedVerificationRef.current &&
      tokenRef.current &&
      isValidVerificationToken(tokenRef.current)
    ) {
      hasExecutedVerificationRef.current = true;
      executeVerification(tokenRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle retry of verification using in-memory preserved token
  const handleRetryVerification = () => {
    if (tokenRef.current && isValidVerificationToken(tokenRef.current)) {
      executeVerification(tokenRef.current);
    } else {
      setState("RESEND_FORM");
    }
  };

  // Handle resend verification form submission
  const handleResendSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isResending) return;

    setErrorMessage(null);

    const validationError = validateResendEmail(resendEmail);
    if (validationError) {
      setResendValidationError(validationError);
      return;
    }

    setResendValidationError(null);
    setIsResending(true);

    const payload = buildResendPayload(resendEmail);

    try {
      let status: number;
      let data: unknown;

      if (resendFn) {
        const customRes = await resendFn(payload);
        status = customRes.status;
        data = customRes.data;
      } else {
        const res = await fetch("/api/auth/resend-verification", {
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
        setSubmittedResendEmail(payload.email);
        setState("RESEND_SUCCESS");
        onResendSuccess?.(payload.email);
      } else if (status === 429 || responseBody?.error === "RATE_LIMIT_EXCEEDED") {
        setErrorMessage(
          responseBody?.message ||
            "Too many verification requests. Please wait a few minutes and try again."
        );
      } else if (status === 403 || responseBody?.error === "CSRF_ERROR") {
        setErrorMessage("Security verification failed. Please refresh the page and try again.");
      } else if (status === 503 || responseBody?.error === "SERVICE_UNAVAILABLE") {
        setErrorMessage("Authentication security service is temporarily unavailable. Please try again later.");
      } else {
        setErrorMessage(
          responseBody?.message ||
            "An error occurred while processing your request. Please try again."
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected network error occurred. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsResending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // VIEW: 1. Verifying / In-Flight State
  // ---------------------------------------------------------------------------
  if (state === "VERIFYING") {
    return (
      <AuthCard
        title="Verifying your email"
        description="Please wait while we confirm your email verification token..."
        badgeText="Verification in Progress"
      >
        <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Validating security token
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This process takes only a moment. Do not close this window.
            </p>
          </div>
        </div>
      </AuthCard>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: 2. Verification Success
  // ---------------------------------------------------------------------------
  if (state === "VERIFIED_SUCCESS") {
    const destination = user ? getRoleRedirectDestination(user.role) : "/auth/login";
    const ctaText = user ? "Go to Portal" : "Proceed to Sign In";

    return (
      <AuthCard
        title="Email Verified Successfully"
        description="Your applicant email address has been confirmed."
        badgeText="Verification Complete"
        footer={
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Thank you for securing your CrediGuide account.
          </p>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Verification Successful
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your email has been verified. You now have full access to loan applications, document uploads, and real-time eligibility calculations.
            </p>
          </div>

          <div className="pt-2">
            <Link
              href={destination}
              className={cn(buttonVariants(), "w-full font-semibold shadow-sm cursor-pointer")}
            >
              {ctaText}
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: 3. Expired or Already Used Token
  // ---------------------------------------------------------------------------
  if (state === "EXPIRED_OR_USED") {
    return (
      <AuthCard
        title="Verification Link Expired or Used"
        description="This email verification link is no longer active."
        badgeText="Link Inactive"
        footer={
          <div className="flex items-center justify-center w-full text-xs text-slate-500 dark:text-slate-400">
            <span>Already verified? </span>
            <Link
              href="/auth/login"
              className="ml-1 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
            >
              Sign in to your account
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
              Link Already Consumed or Expired
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              For your protection, verification links expire after 24 hours and cannot be reused. If you have not verified your email yet, you can request a new verification link below.
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <Button
              type="button"
              onClick={() => {
                setState("RESEND_FORM");
                setErrorMessage(null);
              }}
              className="w-full font-semibold shadow-sm cursor-pointer"
            >
              Request New Verification Link
            </Button>
            <Link
              href="/auth/login"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full text-xs font-medium cursor-pointer"
              )}
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: 4. Transient / Network Error State (Preserves token for retry)
  // ---------------------------------------------------------------------------
  if (state === "TRANSIENT_ERROR") {
    return (
      <AuthCard
        title="Verification Encountered an Issue"
        description="We could not complete your email verification at this time."
        badgeText="Verification Failed"
        footer={
          <div className="flex items-center justify-center w-full text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => {
                setState("RESEND_FORM");
                setErrorMessage(null);
              }}
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
            >
              Request a new verification link instead
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 mx-auto">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Temporary Connection Failure
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {errorMessage || "A network or server error occurred while contacting the verification service."}
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <Button
              type="button"
              onClick={handleRetryVerification}
              className="w-full font-semibold shadow-sm cursor-pointer"
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry Verification
            </Button>
            <Link
              href="/auth/login"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full text-xs font-medium cursor-pointer"
              )}
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: 5. Resend Verification Success (Anti-Enumeration Confirmation)
  // ---------------------------------------------------------------------------
  if (state === "RESEND_SUCCESS") {
    return (
      <AuthCard
        title="Verification Email Dispatched"
        description="Check your inbox for further instructions."
        badgeText="Email Sent"
        footer={
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Remember to check your spam or junk folder if you do not see the message.
          </p>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto">
            <Mail className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Request Received
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              If an account with that email exists and requires verification, a verification email has been sent to{" "}
              {submittedResendEmail ? (
                <strong className="text-slate-900 dark:text-slate-100">{submittedResendEmail}</strong>
              ) : (
                "your address"
              )}
              .
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400 text-left">
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Security Notice
            </p>
            <p>
              Verification links are valid for 24 hours. For security and anti-abuse, requests are limited to 3 attempts per 15 minutes.
            </p>
          </div>

          <div className="pt-2 space-y-2">
            <Link
              href="/auth/login"
              className={cn(buttonVariants(), "w-full font-semibold shadow-sm cursor-pointer")}
            >
              Proceed to Sign In
            </Link>
            <button
              type="button"
              onClick={() => {
                setState("RESEND_FORM");
                setErrorMessage(null);
              }}
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Send to a different email address
            </button>
          </div>
        </div>
      </AuthCard>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW: 6. Resend Verification Request Form (Mode B default)
  // ---------------------------------------------------------------------------
  return (
    <AuthCard
      title="Verify your email"
      description="Enter your registered email address to receive a verification link"
      badgeText="Email Verification"
      footer={
        <div className="flex items-center justify-center w-full text-xs text-slate-500 dark:text-slate-400">
          <Link
            href="/auth/login"
            className="inline-flex items-center font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Back to Sign In
          </Link>
        </div>
      }
    >
      <form onSubmit={handleResendSubmit} noValidate className="space-y-4">
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

        <div className="space-y-1.5 text-left">
          <Label htmlFor="resend-email" required>
            Email address
          </Label>
          <Input
            id="resend-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="applicant@crediguide.com"
            value={resendEmail}
            onChange={(e) => {
              setResendEmail(e.target.value);
              if (resendValidationError) {
                setResendValidationError(null);
              }
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            disabled={isResending}
            hasError={Boolean(resendValidationError)}
            aria-describedby={resendValidationError ? "resend-email-error" : undefined}
            required
          />
          {resendValidationError && (
            <p
              id="resend-email-error"
              className="text-xs text-red-600 dark:text-red-400"
              role="alert"
            >
              {resendValidationError}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isResending}
          className="w-full font-semibold shadow-sm cursor-pointer mt-2"
        >
          {isResending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Sending Verification Email...
            </>
          ) : (
            "Send Verification Email"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

export function VerifyEmailLoadingFallback() {
  return (
    <AuthCard
      title="Verifying your email"
      description="Loading email verification services..."
      badgeText="Email Verification"
    >
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
      </div>
    </AuthCard>
  );
}
