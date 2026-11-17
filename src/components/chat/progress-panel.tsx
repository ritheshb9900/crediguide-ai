"use client";

import React from "react";
import {
  CheckCircle2,
  Circle,
  Banknote,
  DollarSign,
  Briefcase,
  CreditCard,
  User,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExtractedApplicantData } from "@/services/ai/types";
import { formatCurrencyINR } from "@/lib/utils";

interface ProgressPanelProps {
  collectedFields: string[];
  extractedData: Partial<ExtractedApplicantData>;
  readyForAssessment: boolean;
  hasAssessment: boolean;
}

interface FieldDefinition {
  key: keyof ExtractedApplicantData;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  formatter: (val: unknown) => string | null;
}

const TRACKED_FIELDS: FieldDefinition[] = [
  {
    key: "requestedAmount",
    label: "Loan Amount",
    icon: Banknote,
    formatter: (val) => (typeof val === "number" ? formatCurrencyINR(val) : null),
  },
  {
    key: "monthlyNetIncome",
    label: "Monthly Income",
    icon: DollarSign,
    formatter: (val) =>
      typeof val === "number" ? `${formatCurrencyINR(val)} / mo` : null,
  },
  {
    key: "employmentType",
    label: "Employment Type",
    icon: Briefcase,
    formatter: (val) => (typeof val === "string" ? val : null),
  },
  {
    key: "existingMonthlyEmi",
    label: "Existing EMI",
    icon: CreditCard,
    formatter: (val) =>
      typeof val === "number" ? `${formatCurrencyINR(val)} / mo` : null,
  },
  {
    key: "age",
    label: "Age",
    icon: User,
    formatter: (val) => (typeof val === "number" ? `${val} years` : null),
  },
  {
    key: "requestedTenureMonths",
    label: "Loan Tenure",
    icon: Calendar,
    formatter: (val) => {
      if (typeof val !== "number") return null;
      const years = val / 12;
      return Number.isInteger(years)
        ? `${years} yr (${val} mo)`
        : `${val} months`;
    },
  },
];

export function ProgressPanel({
  collectedFields,
  extractedData,
  readyForAssessment,
  hasAssessment,
}: ProgressPanelProps) {
  // Count how many tracked fields are collected
  const completedCount = TRACKED_FIELDS.filter((f) =>
    collectedFields.includes(f.key) || extractedData[f.key] !== undefined
  ).length;

  const totalCount = TRACKED_FIELDS.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-xs bg-white dark:bg-slate-900/90 h-full flex flex-col">
      <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Application Progress
          </CardTitle>
          {hasAssessment ? (
            <Badge variant="success" className="text-[10px] font-semibold">
              Assessed
            </Badge>
          ) : readyForAssessment ? (
            <Badge variant="info" className="text-[10px] font-semibold">
              Ready
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-semibold text-slate-600">
              {completedCount}/{totalCount} Completed
            </Badge>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[11px] text-slate-500 font-medium">
            <span>Profile Completeness</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                completedCount === totalCount
                  ? "bg-emerald-500"
                  : "bg-blue-600"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 flex-1 space-y-2.5 overflow-y-auto">
        {TRACKED_FIELDS.map((field) => {
          const isCollected =
            collectedFields.includes(field.key) ||
            extractedData[field.key] !== undefined;
          const displayValue = field.formatter(extractedData[field.key]);
          const Icon = field.icon;

          return (
            <div
              key={field.key}
              className={`p-2.5 rounded-lg border transition-all text-xs flex items-center justify-between gap-3 ${
                isCollected
                  ? "bg-emerald-50/40 border-emerald-200/60 dark:bg-emerald-950/20 dark:border-emerald-900/40"
                  : "bg-slate-50/50 border-slate-200/60 dark:bg-slate-800/30 dark:border-slate-800"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isCollected ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-400 shrink-0" />
                )}

                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <span
                    className={`font-medium truncate ${
                      isCollected
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {field.label}
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                {isCollected && displayValue ? (
                  <span className="font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px]">
                    {displayValue}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">
                    Pending
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Live helper status note */}
        <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800">
          {hasAssessment ? (
            <p className="text-emerald-700 dark:text-emerald-400 font-medium">
              ✓ Deterministic assessment completed. Review your result card below.
            </p>
          ) : readyForAssessment ? (
            <p className="text-blue-700 dark:text-blue-400 font-medium">
              ✓ All required parameters gathered. Calculating preliminary eligibility...
            </p>
          ) : (
            <p>
              Provide details one by one or in natural sentences. The engine will evaluate automatically once all 6 fields are recorded.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
