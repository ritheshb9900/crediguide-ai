import React from "react";
import { AlertTriangle } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Preliminary Eligibility Notice:</strong> This AI-assisted assistant provides an indicative, pre-qualification assessment. It is <strong>NOT</strong> a final loan approval, loan sanction, or binding financial commitment. Real loan disbursement requires full KYC verification and formal underwriting.
          </span>
        </div>
        <span className="hidden md:inline-block font-mono text-[10px] uppercase tracking-wider bg-amber-200/60 dark:bg-amber-900/50 text-amber-950 dark:text-amber-200 px-2 py-0.5 rounded">
          Hackathon Prototype
        </span>
      </div>
    </div>
  );
}
