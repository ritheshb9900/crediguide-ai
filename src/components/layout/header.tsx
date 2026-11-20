"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, ShieldCheck, Sparkles, Database, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

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

export function Header() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useSafeRouter();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      const result = await logout();
      if (!result.success && result.revoked === false) {
        console.warn(
          "[Header] Session logout completed, but active server-side session revocation could not be confirmed."
        );
      }
    } catch (err: unknown) {
      console.error("[Header] Error occurred during logout:", err);
    } finally {
      setIsLoggingOut(false);
      router?.push("/");
    }
  };

  // Safe display name extraction without inventing details
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email
    : "";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 shadow-xs">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Institutional Indicator */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-indigo-900 text-white shadow-sm">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">
                  CrediGuide AI
                </span>
                <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
                  Enterprise
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Autonomous Lending Intelligence & Policy Governance
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation & Authentication Slot */}
        <nav className="flex items-center gap-2 sm:gap-4">
          {/* Informational Feature Badges */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium mr-2">
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Deterministic Engine
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              AI Assistant
            </span>
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
              <Database className="h-3.5 w-3.5 text-indigo-600" />
              PostgreSQL / Prisma
            </span>
          </div>

          {/* Anchor Links */}
          <Link
            href="/#chat-assistant"
            className="text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
          >
            Chat Assistant
          </Link>
          <Link
            href="/#products"
            className="hidden sm:inline-flex text-xs sm:text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 px-3 py-1.5 rounded-md transition-colors"
          >
            Loan Products
          </Link>
          <Link
            href="/#architecture"
            className="hidden md:inline-flex text-xs sm:text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 px-3 py-1.5 rounded-md transition-colors"
          >
            Architecture
          </Link>

          {/* Vertical Divider */}
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" aria-hidden="true" />

          {/* Authentication State Slot */}
          {isLoading ? (
            /* A. Loading State: Stable Accessible Skeleton */
            <div
              className="h-8 w-24 sm:w-28 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse"
              aria-label="Loading authentication status"
              role="status"
            />
          ) : !isAuthenticated || !user ? (
            /* B. Guest State: Sign In & Register */
            <div className="flex items-center gap-2">
              <Link
                href="/auth/login"
                className="text-xs sm:text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 px-2.5 py-1.5 rounded-md transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
              >
                Register
              </Link>
            </div>
          ) : (
            /* Authenticated States: Role-Specific Navigation, Badges & Logout */
            <div className="flex items-center gap-2 sm:gap-3">
              {/* User Identity & Role Badge */}
              <div className="flex flex-col items-end text-right">
                <span className="text-xs font-semibold text-slate-900 dark:text-white leading-tight">
                  {displayName}
                </span>
                {user.role === "LOAN_APPLICANT" && (
                  <Badge variant="success" className="text-[10px] uppercase font-semibold">
                    Applicant
                  </Badge>
                )}
                {user.role === "BANK_OFFICER" && (
                  <Badge variant="info" className="text-[10px] uppercase font-semibold">
                    Officer
                  </Badge>
                )}
                {user.role === "BANK_ADMIN" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] uppercase font-semibold border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                  >
                    Admin
                  </Badge>
                )}
              </div>

              {/* Role-Specific Portal Navigation */}
              {user.role === "LOAN_APPLICANT" && (
                <Link
                  href="/dashboard"
                  className="text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline px-2 py-1 rounded transition-colors"
                >
                  Dashboard
                </Link>
              )}
              {user.role === "BANK_OFFICER" && (
                <Link
                  href="/officer"
                  className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-400 hover:underline px-2 py-1 rounded transition-colors"
                >
                  Officer Portal
                </Link>
              )}
              {user.role === "BANK_ADMIN" && (
                <Link
                  href="/admin"
                  className="text-xs sm:text-sm font-medium text-purple-700 dark:text-purple-400 hover:underline px-2 py-1 rounded transition-colors"
                >
                  Admin Portal
                </Link>
              )}

              {/* Logout Action Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-xs h-8 px-2.5 sm:px-3 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Log out of session"
              >
                <LogOut className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                {isLoggingOut ? "Signing out..." : "Logout"}
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
