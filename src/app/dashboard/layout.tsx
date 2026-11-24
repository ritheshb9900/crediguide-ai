"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Briefcase,
  FileText,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  comingSoon?: boolean;
  phase?: string;
}

const APPLICANT_NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "My Profile",
    href: "/dashboard/profile",
    icon: User,
    comingSoon: true,
    phase: "Phase 4B.2",
  },
  {
    label: "Loan Products",
    href: "/dashboard/products",
    icon: Briefcase,
    comingSoon: true,
    phase: "Phase 4B.2",
  },
  {
    label: "Applications",
    href: "/applications",
    icon: FileText,
    comingSoon: true,
    phase: "Phase 4C",
  },
];

function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

function useSafePathname() {
  try {
    return usePathname() || "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export default function ApplicantDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const pathname = useSafePathname();
  const router = useSafeRouter();

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (err) {
      console.error("[Applicant Shell] Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
      router?.push("/auth/login");
    }
  };

  // Safe display name extraction
  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email
    : "Applicant";

  // 1. Loading State: Skeleton Shell
  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
        <aside className="hidden md:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
          <div className="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded-md animate-pulse" />
          <div className="space-y-3 pt-4">
            <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-10 w-full bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          </div>
        </aside>
        <main className="flex-1 p-6 sm:p-8 space-y-6">
          <div className="h-10 w-64 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          </div>
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        </main>
      </div>
    );
  }

  // 2. Unauthenticated State
  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Authentication Required
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Please sign in to access your loan applications, credit assessments, and profile.
          </p>
          <div className="pt-2">
            <Link href="/auth/login?returnUrl=/dashboard">
              <Button className="w-full">Sign In to Dashboard</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Role Restriction Notice: Prevent Bank Officers or Admins from navigating applicant view accidentally
  if (user.role !== "LOAN_APPLICANT") {
    const isOfficer = user.role === "BANK_OFFICER";
    const targetUrl = isOfficer ? "/officer" : "/admin";
    const targetLabel = isOfficer ? "Officer Portal" : "Admin Portal";

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4 p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Staff Role Detected
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You are currently signed in as an institutional staff member (<strong>{user.role}</strong>). Please navigate to your operational portal.
          </p>
          <div className="pt-2">
            <Link href={targetUrl}>
              <Button className="w-full">Go to {targetLabel}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authenticated Applicant Portal Shell
  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
      {/* Mobile Backdrop & Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Persistent on Desktop, Slide-over on Mobile */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              CG
            </div>
            <div>
              <span className="font-bold text-sm text-slate-900 dark:text-white block leading-tight">
                Applicant Portal
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Borrower Services
              </span>
            </div>
          </div>
          <button
            type="button"
            className="md:hidden text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 p-1"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Applicant Profile Summary Chip */}
        <div className="p-4 mx-3 my-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[140px]">
              {displayName}
            </span>
            <Badge variant="success" className="text-[10px] px-1.5 py-0 uppercase">
              Applicant
            </Badge>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {user.email}
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto" aria-label="Applicant Navigation">
          {APPLICANT_NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium opacity-60 cursor-not-allowed select-none text-slate-400 dark:text-slate-500"
                  title={`${item.label} (${item.phase || "Coming Soon"})`}
                  aria-disabled="true"
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="flex-1 truncate">{item.label}</span>
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1.5 py-0 font-normal tracking-wide text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 bg-slate-100/60 dark:bg-slate-800/60"
                  >
                    Soon
                  </Badge>
                </div>
              );
            }

            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold shadow-xs"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-slate-400 dark:text-slate-500"
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer & Institutional Help */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300">
            <span className="font-semibold block mb-0.5">Need Assistance?</span>
            Speak with our conversational AI assistant for instant eligibility guidance.
            <div className="mt-2">
              <Link
                href="/#chat-assistant"
                className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400 hover:underline"
              >
                Open Chat Assistant <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="w-full justify-start text-xs text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Log out of applicant session"
          >
            <LogOut className="h-3.5 w-3.5 mr-2 text-slate-500" />
            {isLoggingOut ? "Signing out..." : "Sign Out"}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Sub-bar */}
        <div className="md:hidden flex items-center justify-between h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Open applicant navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            Applicant Portal
          </span>

          <Badge variant="success" className="text-[10px] uppercase">
            Applicant
          </Badge>
        </div>

        {/* Page Children Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
