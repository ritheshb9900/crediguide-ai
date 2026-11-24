"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  TrendingUp,
  CreditCard,
  UserCheck,
  RefreshCw,
  Info,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyINR } from "@/lib/utils";

interface ApplicationItem {
  id: string;
  applicationNumber: string;
  productName: string;
  productCode: string;
  requestedAmount: number;
  requestedTenureMonths: number;
  purpose: string | null;
  status: string;
  submissionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AssessmentItem {
  id: string;
  productName: string;
  productCode: string;
  requestedAmount: number;
  requestedTenureMonths: number;
  status: string;
  eligibleAmount: number | null;
  indicativeInterestRate: number | null;
  indicativeEmi: number | null;
  summary: string;
  createdAt: string;
}

interface DashboardData {
  applicant: {
    id: string;
    firstName: string;
    lastName: string;
    profileCompletion: {
      percentage: number;
      isComplete: boolean;
      completedFields: number;
      totalFields: number;
      missingFields: string[];
    };
  } | null;
  summary: {
    totalApplications: number;
    activeApplications: number;
    approvedApplications: number;
    disbursedApplications: number;
    draftApplications: number;
    rejectedApplications: number;
  };
  applications: ApplicationItem[];
  recentAssessments: AssessmentItem[];
}

/**
 * Returns accessible badge variant and human-readable label for application statuses.
 */
function getStatusBadge(status: string) {
  switch (status) {
    case "APPROVED":
      return { variant: "success" as const, label: "Approved" };
    case "DISBURSED":
      return { variant: "success" as const, label: "Disbursed" };
    case "CONDITIONALLY_ELIGIBLE":
    case "RECOMMENDED":
      return { variant: "info" as const, label: "Conditionally Eligible" };
    case "UNDER_REVIEW":
      return { variant: "info" as const, label: "Under Review" };
    case "SUBMITTED":
      return { variant: "info" as const, label: "Submitted" };
    case "DOCUMENTS_REQUIRED":
      return { variant: "warning" as const, label: "Documents Required" };
    case "DRAFT":
      return { variant: "secondary" as const, label: "Draft" };
    case "REJECTED":
      return { variant: "destructive" as const, label: "Rejected" };
    case "WITHDRAWN":
      return { variant: "outline" as const, label: "Withdrawn" };
    default:
      return { variant: "secondary" as const, label: status };
  }
}

/**
 * Formats ISO date string to Indian locale date.
 */
function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ApplicantDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<ApplicationItem | null>(null);

  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRetryCount((c) => c + 1);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadDashboard() {
      try {
        const res = await fetch("/api/applicant/dashboard", {
          headers: { Accept: "application/json" },
          credentials: "include",
        });

        if (isCancelled) return;

        if (!res.ok) {
          if (res.status === 401) {
            setError("Your session has expired. Please sign in again.");
            return;
          }
          if (res.status === 403) {
            setError("Access forbidden. This portal is reserved for loan applicants.");
            return;
          }
          throw new Error(`Failed to load dashboard (HTTP ${res.status})`);
        }

        const json = await res.json();
        if (isCancelled) return;

        if (json.success) {
          setData(json);
        } else {
          setError(json.message || "Failed to load dashboard data.");
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("[Dashboard] Error fetching dashboard data:", err);
          setError("An unexpected error occurred while loading your dashboard. Please try again.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isCancelled = true;
    };
  }, [retryCount]);

  // Applicant display name
  const applicantName = data?.applicant
    ? `${data.applicant.firstName} ${data.applicant.lastName}`.trim()
    : user
    ? `${user.firstName} ${user.lastName}`.trim() || user.email
    : "Applicant";

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading dashboard data">
        <div className="h-16 w-3/4 max-w-lg bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20">
        <CardContent className="p-6 text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-red-900 dark:text-red-200">
              Unable to Load Dashboard
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="border-red-300 text-red-700 hover:bg-red-100 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary || {
    totalApplications: 0,
    activeApplications: 0,
    approvedApplications: 0,
    disbursedApplications: 0,
    draftApplications: 0,
    rejectedApplications: 0,
  };

  const applications = data?.applications || [];
  const profileCompletion = data?.applicant?.profileCompletion;

  return (
    <div className="space-y-6">
      {/* A. Welcome Header & Profile Readiness */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Welcome back, {applicantName}
            </h1>
            <Badge variant="success" className="text-[10px] px-2 py-0 uppercase">
              Active Borrower
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Track your personal loan applications, review deterministic eligibility assessments, and discover tailored credit products.
          </p>
        </div>

        {/* Profile Completion Meter */}
        {profileCompletion && (
          <div className="shrink-0 bg-white/10 backdrop-blur-xs border border-white/15 p-4 rounded-xl min-w-[220px]">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-emerald-400" /> Profile Completion
              </span>
              <span className="font-bold text-white">{profileCompletion.percentage}%</span>
            </div>
            <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${profileCompletion.percentage}%` }}
              />
            </div>
            {!profileCompletion.isComplete ? (
              <p className="text-[11px] text-slate-300 mt-2">
                Missing: {profileCompletion.missingFields.slice(0, 2).join(", ")}
                {profileCompletion.missingFields.length > 2 && "..."}
              </p>
            ) : (
              <p className="text-[11px] text-emerald-300 mt-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Profile fully completed
              </p>
            )}
          </div>
        )}
      </div>

      {/* B. Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Applications */}
        <Card className="hover:border-slate-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Total Applications
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary.totalApplications}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {summary.draftApplications > 0
                ? `${summary.draftApplications} unsubmitted draft`
                : "All loan records"}
            </p>
          </CardContent>
        </Card>

        {/* Active Applications */}
        <Card className="hover:border-slate-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Active Under Review
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary.activeApplications}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              In underwriter scrutiny
            </p>
          </CardContent>
        </Card>

        {/* Approved Applications */}
        <Card className="hover:border-slate-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Sanctioned / Approved
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary.approvedApplications}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Credit approval granted
            </p>
          </CardContent>
        </Card>

        {/* Disbursed Applications */}
        <Card className="hover:border-slate-300 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
            <CardTitle className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Disbursed Loans
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary.disbursedApplications}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Funds transferred to account
            </p>
          </CardContent>
        </Card>
      </div>

      {/* D. Quick Action Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Action 1: Explore Products (points to existing active catalog on landing page until Phase 4B.2) */}
        <Link href="/#products" className="block">
          <Card className="h-full hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                  Browse Loan Products
                </span>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Compare interest rates, tenure options, and check product policy rules.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0 self-center" />
            </CardContent>
          </Card>
        </Link>

        {/* Action 2: Check Pre-Eligibility */}
        <Link href="/#chat-assistant" className="block">
          <Card className="h-full hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-900 dark:text-white block">
                  Check Pre-Eligibility
                </span>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Run deterministic rules evaluation via conversational banking assistant.
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 shrink-0 self-center" />
            </CardContent>
          </Card>
        </Link>

        {/* Action 3: New Formal Application (Phase 4C preview) */}
        <Card className="h-full border-dashed bg-slate-50/60 dark:bg-slate-900/40">
          <CardContent className="p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                  Start Application
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-300">
                  Phase 4C
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Multi-step application filing engine launching in the next phase.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* C & E. Applications Overview & Empty State */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 p-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              My Loan Applications
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Review current status, loan parameters, and underwriting progress.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            className="text-xs cursor-pointer h-8"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" /> Refresh
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {applications.length === 0 ? (
            /* E. Empty State */
            <div className="p-12 text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <FileText className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  No Loan Applications Found
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  You haven&apos;t submitted any loan applications yet. Explore our loan products or test your eligibility to get started.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <Link href="/#products">
                  <Button size="sm" className="text-xs cursor-pointer">
                    Browse Available Products
                  </Button>
                </Link>
                <Link href="/#chat-assistant">
                  <Button variant="outline" size="sm" className="text-xs cursor-pointer">
                    Check Eligibility via Chat
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            /* Applications Table */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
                  <tr>
                    <th className="py-3 px-4 sm:px-6">Application No.</th>
                    <th className="py-3 px-4">Loan Product</th>
                    <th className="py-3 px-4">Requested Amount</th>
                    <th className="py-3 px-4">Tenure</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created / Submitted</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {applications.map((app) => {
                    const badge = getStatusBadge(app.status);
                    return (
                      <tr
                        key={app.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-4 sm:px-6 font-semibold text-slate-900 dark:text-white">
                          {app.applicationNumber}
                        </td>
                        <td className="py-3.5 px-4">{app.productName}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                          {formatCurrencyINR(app.requestedAmount)}
                        </td>
                        <td className="py-3.5 px-4">{app.requestedTenureMonths} mos</td>
                        <td className="py-3.5 px-4">
                          <Badge variant={badge.variant} className="text-[10px] px-2 py-0.5">
                            {badge.label}
                          </Badge>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {formatDate(app.submissionDate || app.createdAt)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedApp(app)}
                            className="text-[11px] h-7 px-2.5 cursor-pointer"
                          >
                            View Summary
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slide-over Detail Modal for selected application */}
      {selectedApp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={() => setSelectedApp(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-app-title"
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 id="modal-app-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Application Summary
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedApp.applicationNumber}
                </span>
              </div>
              <Badge variant={getStatusBadge(selectedApp.status).variant}>
                {getStatusBadge(selectedApp.status).label}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500 block">Product</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedApp.productName}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500 block">Requested Amount</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrencyINR(selectedApp.requestedAmount)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500 block">Requested Tenure</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedApp.requestedTenureMonths} months
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500 block">Purpose</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {selectedApp.purpose || "Personal / General"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500 block">Created On</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatDate(selectedApp.createdAt)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500 block">Submission Date</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatDate(selectedApp.submissionDate)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 text-[11px] text-blue-800 dark:text-blue-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Full document uploads and interactive underwriter timeline tracking will be available in Phase 4D.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedApp(null)}
                className="cursor-pointer text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Pre-Assessments Section */}
      {data?.recentAssessments && data.recentAssessments.length > 0 && (
        <Card>
          <CardHeader className="pb-3 p-6 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              Recent Eligibility Assessments
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Evaluations computed by our deterministic underwriting engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-3">
            {data.recentAssessments.map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {a.productName}
                    </span>
                    <Badge
                      variant={
                        a.status === "ELIGIBLE"
                          ? "success"
                          : a.status === "CONDITIONAL"
                          ? "info"
                          : "destructive"
                      }
                      className="text-[10px]"
                    >
                      {a.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Requested: {formatCurrencyINR(a.requestedAmount)} for {a.requestedTenureMonths} mos
                    {a.eligibleAmount != null && (
                      <span className="ml-2 font-medium text-emerald-700 dark:text-emerald-400">
                        • Eligible up to: {formatCurrencyINR(a.eligibleAmount)}
                      </span>
                    )}
                  </p>
                  {a.summary && (
                    <p className="text-[11px] text-slate-500 max-w-xl truncate">
                      {a.summary}
                    </p>
                  )}
                </div>

                <div className="text-right text-[11px] text-slate-500 shrink-0">
                  <span className="flex items-center gap-1 sm:justify-end">
                    <Calendar className="h-3 w-3" /> {formatDate(a.createdAt)}
                  </span>
                  {a.indicativeInterestRate != null && (
                    <span className="block mt-0.5 font-medium text-slate-700 dark:text-slate-300">
                      Indicative Rate: {a.indicativeInterestRate.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
