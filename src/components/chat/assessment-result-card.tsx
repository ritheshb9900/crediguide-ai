"use client";

import React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ArrowRight,
  ShieldCheck,
  Building,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeterministicAssessmentResponse } from "@/types/domain";
import {
  formatCurrencyINR,
  formatCurrencyINRPrecise,
  formatPercentage,
} from "@/lib/utils";

interface AssessmentResultCardProps {
  assessment: DeterministicAssessmentResponse;
  onExploreScenario?: () => void;
}

export function AssessmentResultCard({
  assessment,
  onExploreScenario,
}: AssessmentResultCardProps) {
  const { status, financialMetrics, criteria, documents, nextSteps, loanProduct } =
    assessment;

  const isEligible = status === "ELIGIBLE";
  const isConditional = status === "CONDITIONAL";

  // Visual status styles
  const statusConfig = isEligible
    ? {
        badgeVariant: "success" as const,
        borderClass: "border-emerald-300 dark:border-emerald-800",
        bgClass: "bg-emerald-50/60 dark:bg-emerald-950/20",
        headerBg: "bg-gradient-to-r from-emerald-600 to-teal-700 text-white",
        icon: CheckCircle2,
        title: "Preliminary Status: ELIGIBLE",
        subtitle:
          "Congratulations! You meet all preliminary demonstration criteria for this personal loan product.",
      }
    : isConditional
    ? {
        badgeVariant: "warning" as const,
        borderClass: "border-amber-300 dark:border-amber-800",
        bgClass: "bg-amber-50/60 dark:bg-amber-950/20",
        headerBg: "bg-gradient-to-r from-amber-600 to-orange-700 text-white",
        icon: AlertTriangle,
        title: "Preliminary Status: CONDITIONAL",
        subtitle:
          "Basic eligibility is met, but your requested amount exceeds current borrowing capacity. An adjusted offer is available.",
      }
    : {
        badgeVariant: "destructive" as const,
        borderClass: "border-rose-300 dark:border-rose-800",
        bgClass: "bg-rose-50/60 dark:bg-rose-950/20",
        headerBg: "bg-gradient-to-r from-rose-700 to-red-800 text-white",
        icon: XCircle,
        title: "Preliminary Status: NOT ELIGIBLE",
        subtitle:
          "Based on current financial and policy parameters, the application does not meet preliminary criteria.",
      };

  const StatusIcon = statusConfig.icon;

  return (
    <Card
      className={`border-2 ${statusConfig.borderClass} shadow-md overflow-hidden bg-white dark:bg-slate-900 transition-all`}
    >
      {/* Result Header Banner */}
      <div className={`p-4 sm:p-5 ${statusConfig.headerBg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20 backdrop-blur-xs">
              <StatusIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-bold tracking-tight">
                  {statusConfig.title}
                </h3>
                <Badge
                  variant="outline"
                  className="bg-white/20 text-white border-white/40 text-[10px]"
                >
                  {loanProduct.name}
                </Badge>
              </div>
              <p className="text-xs text-white/90 mt-0.5 max-w-2xl leading-relaxed">
                {statusConfig.subtitle}
              </p>
            </div>
          </div>

          <div className="self-start sm:self-auto shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/20 text-[11px] font-medium text-white/90">
            <ShieldCheck className="h-3.5 w-3.5 text-white" />
            <span>Deterministic Engine Verified</span>
          </div>
        </div>
      </div>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Financial Metrics Summary Grid (Zero frontend math, strictly from backend) */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
            <Building className="h-3.5 w-3.5 text-blue-600" />
            Key Evaluated Financial Metrics
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Requested Amount
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {formatCurrencyINR(financialMetrics.requestedAmount)}
              </div>
              <div className="text-[10px] text-slate-400">
                {financialMetrics.requestedTenureMonths} mo tenure
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/60">
              <div className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                Proposed Monthly EMI
              </div>
              <div className="text-base font-bold text-blue-900 dark:text-blue-100 mt-1">
                {formatCurrencyINRPrecise(financialMetrics.proposedMonthlyEmi)}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400">
                @ {loanProduct.indicativeInterestRate}% p.a.
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Existing FOIR
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {formatPercentage(financialMetrics.existingFoirPercentage)}
              </div>
              <div className="text-[10px] text-slate-400">
                EMI: {formatCurrencyINR(financialMetrics.existingEmi)}/mo
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Total Proposed FOIR
              </div>
              <div
                className={`text-base font-bold mt-1 ${
                  financialMetrics.totalFoirPercentage > 50
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {formatPercentage(financialMetrics.totalFoirPercentage)}
              </div>
              <div className="text-[10px] text-slate-400">Max limit: 50.00%</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60">
              <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                Max Eligible Capacity
              </div>
              <div className="text-base font-bold text-emerald-900 dark:text-emerald-100 mt-1">
                {formatCurrencyINR(financialMetrics.maxEligibleAmount)}
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                Based on debt limit
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Available Capacity
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {formatCurrencyINR(financialMetrics.availableMonthlyCapacity)}
              </div>
              <div className="text-[10px] text-slate-400">Remaining EMI buffer</div>
            </div>
          </div>
        </div>

        {/* Individual Criteria Evaluation Breakdown */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            Individual Policy Criteria Evaluation ({criteria.length} Rules Evaluated)
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {criteria.map((item, idx) => {
              const isPass = item.status === "PASS";
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border transition-all text-xs space-y-1.5 ${
                    isPass
                      ? "bg-slate-50/70 border-slate-200 dark:bg-slate-800/40 dark:border-slate-800"
                      : "bg-rose-50/40 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isPass ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.criterion}
                      </span>
                    </div>
                    <Badge
                      variant={isPass ? "success" : "destructive"}
                      className="text-[10px] py-0 px-1.5"
                    >
                      {item.status}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pl-6">
                    <span>
                      Applicant:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {item.applicantValue}
                      </strong>
                    </span>
                    <span>
                      Rule:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {item.requiredValue}
                      </strong>
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-400 pl-6 leading-relaxed">
                    {item.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Required Documents & Next Steps */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Required Documents */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-blue-600" />
              Required Documents ({documents.length})
            </h5>
            <ul className="space-y-2">
              {documents.map((doc, idx) => (
                <li
                  key={idx}
                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs flex items-start justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {doc.name}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {doc.description}
                    </p>
                  </div>
                  {doc.isMandatory ? (
                    <Badge variant="outline" className="text-[9px] shrink-0 text-amber-700 border-amber-300">
                      Mandatory
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[9px] shrink-0">
                      Optional
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Next Steps */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ArrowRight className="h-4 w-4 text-emerald-600" />
              Recommended Next Steps
            </h5>
            <ul className="space-y-2">
              {nextSteps.map((step, idx) => (
                <li
                  key={idx}
                  className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs flex items-start gap-2.5"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-bold text-[10px]">
                    {idx + 1}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ul>

            {onExploreScenario && (
              <div className="pt-2">
                <button
                  onClick={onExploreScenario}
                  type="button"
                  className="w-full py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:hover:bg-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <span>Explore Another Scenario (What-If)</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Regulatory & Preliminary Disclaimer */}
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <p>
            {assessment.disclaimer ||
              "Note: This is a preliminary eligibility assessment based on the information provided. It is not a final loan approval or sanction. Final sanction requires lender verification, credit bureau pull, and formal underwriting."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
