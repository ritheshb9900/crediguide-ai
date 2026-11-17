"use client";

import React, { useState } from "react";
import { SlidersHorizontal, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeterministicAssessmentResponse } from "@/types/domain";
import { formatCurrencyINR } from "@/lib/utils";

interface ScenarioExplorerProps {
  initialAssessment: DeterministicAssessmentResponse;
  onScenarioAssessed: (newAssessment: DeterministicAssessmentResponse) => void;
}

export function ScenarioExplorer({
  initialAssessment,
  onScenarioAssessed,
}: ScenarioExplorerProps) {
  const { applicant, financialMetrics } = initialAssessment;

  const [amount, setAmount] = useState<number>(financialMetrics.requestedAmount);
  const [tenureMonths, setTenureMonths] = useState<number>(
    financialMetrics.requestedTenureMonths
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant: {
            firstName: applicant.firstName || "Applicant",
            lastName: applicant.lastName || "Demo",
            email: applicant.email || "applicant@demo.com",
            phone: "9876543210",
            age: applicant.age,
            employmentType: applicant.employmentType,
            monthlyNetIncome: applicant.monthlyNetIncome,
            existingMonthlyEmi: applicant.existingMonthlyEmi,
          },
          requestedAmount: amount,
          requestedTenureMonths: tenureMonths,
          productCode: "PL_STANDARD",
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to calculate scenario");
      }

      onScenarioAssessed(data.assessment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error recalculating scenario");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/40 via-white to-slate-50 dark:from-slate-900 dark:to-indigo-950/20 shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
            Explore Another Scenario (What-If Analysis)
          </CardTitle>
          <span className="text-[11px] text-slate-500">
            Powered by Deterministic Engine
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Simulate a different loan amount or repayment tenure using your current verified profile (Income: {formatCurrencyINR(applicant.monthlyNetIncome)}, EMI: {formatCurrencyINR(applicant.existingMonthlyEmi)}).
        </p>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleRecalculate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                <span>Loan Amount</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {formatCurrencyINR(amount)}
                </span>
              </label>
              <input
                type="range"
                min={50000}
                max={2500000}
                step={25000}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>₹50k</span>
                <span>₹10 Lakh</span>
                <span>₹25 Lakh</span>
              </div>
            </div>

            {/* Tenure Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                <span>Repayment Tenure</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {tenureMonths / 12} yrs ({tenureMonths} mo)
                </span>
              </label>
              <input
                type="range"
                min={12}
                max={84}
                step={12}
                value={tenureMonths}
                onChange={(e) => setTenureMonths(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>1 Year</span>
                <span>4 Years</span>
                <span>7 Years</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={isLoading}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Calculating...
                </>
              ) : (
                <>
                  Recalculate Scenario <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
