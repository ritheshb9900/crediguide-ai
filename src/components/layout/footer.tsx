import React from "react";
import { Landmark, Shield, FileText, CheckCircle2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-700 text-white">
              <Landmark className="h-4 w-4" />
            </div>
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              FinSmart LoanAssist
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">
            Prototype developed for the TCS Automated Loan Eligibility Chatbot challenge. Featuring a strict dual-layer architecture where AI powers conversational understanding while a deterministic engine guarantees 100% policy-compliant eligibility calculations.
          </p>
          <div className="flex flex-wrap gap-4 pt-2">
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Transparent Math
            </span>
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <Shield className="h-3.5 w-3.5 text-blue-600" /> Deterministic Rules
            </span>
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <FileText className="h-3.5 w-3.5 text-indigo-600" /> Regulatory Audit Trail
            </span>
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider text-[11px]">
            Architecture Stack
          </h4>
          <ul className="space-y-1.5 text-slate-600 dark:text-slate-400">
            <li>Next.js App Router (TypeScript)</li>
            <li>Tailwind CSS &amp; Modern Components</li>
            <li>PostgreSQL &amp; Prisma ORM 7</li>
            <li>Zod Schema Validation</li>
            <li>Pluggable AI &amp; Data Adapter Layer</li>
          </ul>
        </div>

        <div>
          <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider text-[11px]">
            Regulatory Disclaimer
          </h4>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-[11px]">
            This system generates indicative pre-qualification assessments. It does not replace credit committee approvals, physical KYC, or bureau sanction letters.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>© 2026 TCS Loan Eligibility AI Prototype. All rights reserved.</p>
        <p className="text-[11px] text-slate-400">
          Built for TCS Hackathon • Stage 1 Initial Setup &amp; Architecture
        </p>
      </div>
    </footer>
  );
}
