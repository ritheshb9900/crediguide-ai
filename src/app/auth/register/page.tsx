"use client";

import React, { useState, useEffect, Suspense, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";

import { AuthCard } from "@/components/auth/auth-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { PasswordStrength, evaluatePasswordStrength } from "@/components/auth/password-strength";
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

export interface RegistrationFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

export interface RegistrationValidationErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
}

export interface CleanRegistrationPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export interface RegistrationSuccessData {
  email: string;
  emailDelivery: {
    dispatched: boolean;
    message: string;
  };
}

/**
 * Pure client-side validation logic strictly mirroring the backend
 * RegisterApplicantInputSchema in src/lib/auth/validation.ts.
 */
export function validateRegistrationInput(
  values: RegistrationFormValues
): RegistrationValidationErrors {
  const errors: RegistrationValidationErrors = {};

  // 1. First Name (Required, 2-50 characters)
  const trimmedFirstName = values.firstName.trim();
  if (!trimmedFirstName) {
    errors.firstName = "First name is required.";
  } else if (trimmedFirstName.length < 2) {
    errors.firstName = "First name must be at least 2 characters long.";
  } else if (trimmedFirstName.length > 50) {
    errors.firstName = "First name must not exceed 50 characters.";
  }

  // 2. Last Name (Required, 1-50 characters)
  const trimmedLastName = values.lastName.trim();
  if (!trimmedLastName) {
    errors.lastName = "Last name is required.";
  } else if (trimmedLastName.length < 1) {
    errors.lastName = "Last name must be at least 1 character long.";
  } else if (trimmedLastName.length > 50) {
    errors.lastName = "Last name must not exceed 50 characters.";
  }

  // 3. Email (Required, RFC 5322 format, non-example.com domain)
  const trimmedEmail = values.email.trim();
  if (!trimmedEmail) {
    errors.email = "Email address is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    errors.email = "Please enter a valid email address.";
  } else if (trimmedEmail.toLowerCase().endsWith("@example.com")) {
    errors.email = "Registration cannot use reserved demonstration domain (@example.com).";
  }

  // 4. Phone (Optional, Indian 10-digit mobile: starts with 6, 7, 8, or 9)
  const trimmedPhone = values.phone.trim();
  if (trimmedPhone && !/^[6-9]\d{9}$/.test(trimmedPhone)) {
    errors.phone = "Phone number must be a valid 10-digit Indian mobile number.";
  }

  // 5. Password (Required, 8-128 chars, 5 complexity criteria)
  const pwd = values.password;
  if (!pwd) {
    errors.password = "Password is required.";
  } else {
    const strength = evaluatePasswordStrength(pwd);
    if (!strength.isValid) {
      if (pwd.length < 8 || pwd.length > 128) {
        errors.password = "Password must be between 8 and 128 characters long.";
      } else {
        errors.password = "Password does not satisfy all complexity requirements.";
      }
    }
  }

  // 6. Confirm Password (Must match password)
  if (!values.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

/**
 * Builds the exact, sanitized registration payload to transmit to the API.
 * CRITICAL SECURITY INVARIANT:
 * - Excludes confirmPassword.
 * - Excludes role, isAdmin, permissions, employmentType, monthlyNetIncome.
 * - Normalizes email to lowercase.
 * - Only includes phone if a non-empty value was provided.
 */
export function buildRegistrationPayload(
  values: RegistrationFormValues
): CleanRegistrationPayload {
  const payload: CleanRegistrationPayload = {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
  };

  const trimmedPhone = values.phone.trim();
  if (trimmedPhone) {
    payload.phone = trimmedPhone;
  }

  return payload;
}

export interface RegisterFormProps {
  onSuccess?: (data: RegistrationSuccessData) => void;
  registerFn?: (
    payload: CleanRegistrationPayload
  ) => Promise<{ status: number; data: unknown }>;
}

export function RegisterForm({ onSuccess, registerFn }: RegisterFormProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useSafeRouter();
  const searchParams = useSafeSearchParams();

  const [formValues, setFormValues] = useState<RegistrationFormValues>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<RegistrationValidationErrors>({});
  const [successData, setSuccessData] = useState<RegistrationSuccessData | null>(null);

  const rawReturnUrl = searchParams?.get("returnUrl");

  // Redirect already-authenticated users immediately to their designated portal
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const destination = getRoleRedirectDestination(user.role, rawReturnUrl);
      router?.replace(destination);
    }
  }, [isLoading, isAuthenticated, user, router, rawReturnUrl]);

  const handleChange = (field: keyof RegistrationFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || isLoading) return;

    setErrorMessage(null);

    // 1. Client-Side Validation
    const errors = validateRegistrationInput(formValues);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    // 2. Build Minimal, Sanitized API Payload
    const payload = buildRegistrationPayload(formValues);

    try {
      let status: number;
      let data: unknown;

      if (registerFn) {
        const customRes = await registerFn(payload);
        status = customRes.status;
        data = customRes.data;
      } else {
        const res = await fetch("/api/auth/register", {
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
        details?: { fieldErrors?: Record<string, string[]> };
        user?: { email?: string };
        emailDelivery?: { dispatched: boolean; message: string };
      } | null;

      if (status === 201 && responseBody?.success) {
        const outcome: RegistrationSuccessData = {
          email: responseBody.user?.email || payload.email,
          emailDelivery: responseBody.emailDelivery || {
            dispatched: false,
            message: "Outbound email delivery is currently disabled. Account remains unverified.",
          },
        };
        setSuccessData(outcome);
        onSuccess?.(outcome);
      } else {
        // Map backend error contracts
        if (responseBody?.error === "EMAIL_ALREADY_EXISTS") {
          setErrorMessage("An account with this email address already exists.");
        } else if (responseBody?.error === "RESERVED_DOMAIN") {
          setErrorMessage("Registration cannot use reserved demonstration domain (@example.com).");
        } else if (responseBody?.error === "DEMO_APPLICANT_PROTECTED") {
          setErrorMessage("Registration cannot use reserved demonstration applicant credentials.");
        } else if (responseBody?.error === "VALIDATION_FAILED") {
          setErrorMessage(
            responseBody.message || "Input validation failed. Please check applicant details."
          );
          if (responseBody.details?.fieldErrors) {
            const apiFieldErrors: RegistrationValidationErrors = {};
            for (const [key, msgs] of Object.entries(responseBody.details.fieldErrors)) {
              if (Array.isArray(msgs) && msgs.length > 0) {
                if (key in formValues) {
                  apiFieldErrors[key as keyof RegistrationValidationErrors] = msgs[0];
                }
              }
            }
            setValidationErrors((prev) => ({ ...prev, ...apiFieldErrors }));
          }
        } else if (status === 403) {
          setErrorMessage("Security verification failed. Please refresh the page and try again.");
        } else {
          setErrorMessage(
            responseBody?.message || "Registration failed. Please verify your details and try again."
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

  // Success Confirmation State (Post-Registration)
  if (successData) {
    return (
      <AuthCard
        title="Registration Successful"
        description="Your applicant account has been created."
        badgeText="Account Created"
        footer={
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ready to log in?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline transition-colors"
            >
              Sign in to your account
            </Link>
          </p>
        }
      >
        <div className="space-y-4 text-center py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Welcome to CrediGuide AI!
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              An applicant profile has been established for{" "}
              <strong className="text-slate-900 dark:text-slate-100">{successData.email}</strong>.
            </p>
          </div>

          {/* Email Delivery Banner */}
          <div
            className={cn(
              "rounded-lg p-3 text-xs flex items-start gap-2.5 text-left border transition-colors",
              successData.emailDelivery.dispatched
                ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-300"
                : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-300"
            )}
          >
            <Mail className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">
                {successData.emailDelivery.dispatched
                  ? "Verification Email Dispatched"
                  : "Email Verification Notice"}
              </p>
              <p className="leading-relaxed">{successData.emailDelivery.message}</p>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/auth/login"
              className={cn(buttonVariants(), "w-full font-semibold shadow-sm cursor-pointer")}
            >
              Proceed to Sign In
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      description="Register for your enterprise lending intelligence portal"
      badgeText="Applicant Registration"
      footer={
        <div className="flex items-center justify-center w-full text-xs text-slate-500 dark:text-slate-400">
          <span>Already have an account? </span>
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
              {errorMessage.includes("already exists") && (
                <div>
                  <Link
                    href="/auth/login"
                    className="font-medium underline hover:text-red-900 dark:hover:text-red-200"
                  >
                    Click here to sign in
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Name Fields (2 Columns on SM+) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          {/* First Name */}
          <div className="space-y-1.5">
            <Label htmlFor="firstName" required>
              First name
            </Label>
            <Input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              placeholder="Jane"
              value={formValues.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              disabled={isSubmitting || isLoading}
              hasError={Boolean(validationErrors.firstName)}
              aria-describedby={validationErrors.firstName ? "firstName-error" : undefined}
              required
            />
            {validationErrors.firstName && (
              <p
                id="firstName-error"
                className="text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {validationErrors.firstName}
              </p>
            )}
          </div>

          {/* Last Name */}
          <div className="space-y-1.5">
            <Label htmlFor="lastName" required>
              Last name
            </Label>
            <Input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              placeholder="Doe"
              value={formValues.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              disabled={isSubmitting || isLoading}
              hasError={Boolean(validationErrors.lastName)}
              aria-describedby={validationErrors.lastName ? "lastName-error" : undefined}
              required
            />
            {validationErrors.lastName && (
              <p
                id="lastName-error"
                className="text-xs text-red-600 dark:text-red-400"
                role="alert"
              >
                {validationErrors.lastName}
              </p>
            )}
          </div>
        </div>

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
            value={formValues.email}
            onChange={(e) => handleChange("email", e.target.value)}
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

        {/* Phone Field (Optional Indian Mobile) */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="phone">
            Phone number{" "}
            <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              (Optional)
            </span>
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="9876543210 (10-digit mobile)"
            value={formValues.phone}
            onChange={(e) => handleChange("phone", e.target.value)}
            disabled={isSubmitting || isLoading}
            hasError={Boolean(validationErrors.phone)}
            aria-describedby={validationErrors.phone ? "phone-error" : undefined}
          />
          {validationErrors.phone && (
            <p id="phone-error" className="text-xs text-red-600 dark:text-red-400" role="alert">
              {validationErrors.phone}
            </p>
          )}
        </div>

        {/* Password Field with Show/Hide Toggle */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="password" required>
            Password
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={formValues.password}
              onChange={(e) => handleChange("password", e.target.value)}
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
            <PasswordStrength password={formValues.password} />
          </div>
        </div>

        {/* Confirm Password Field with Show/Hide Toggle */}
        <div className="space-y-1.5 text-left">
          <Label htmlFor="confirmPassword" required>
            Confirm password
          </Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={formValues.confirmPassword}
              onChange={(e) => handleChange("confirmPassword", e.target.value)}
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
              Creating Account...
            </>
          ) : (
            "Create Account"
          )}
        </Button>
      </form>
    </AuthCard>
  );
}

export function RegisterLoadingFallback() {
  return (
    <AuthCard
      title="Create your account"
      description="Register for your enterprise lending intelligence portal"
      badgeText="Applicant Registration"
    >
      <div className="space-y-4 py-4 animate-pulse">
        <div className="grid grid-cols-2 gap-3">
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-10 bg-blue-200 dark:bg-blue-900/40 rounded-lg" />
      </div>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Suspense fallback={<RegisterLoadingFallback />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
