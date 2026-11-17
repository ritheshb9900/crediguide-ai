import React from "react";
import Link from "next/link";
import { Landmark, ShieldCheck, Sparkles, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 shadow-xs">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 to-indigo-900 text-white shadow-sm">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white tracking-tight text-base sm:text-lg">
                  FinSmart LoanAssist
                </span>
                <Badge variant="secondary" className="text-[10px] uppercase font-semibold">
                  TCS BFSI
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Automated Loan Eligibility Assessment Platform
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex items-center gap-2 sm:gap-4">
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium mr-2">
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

          <Link
            href="/#chat-assistant"
            className="text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
          >
            Chat Assistant
          </Link>
          <Link
            href="/#products"
            className="text-xs sm:text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 px-3 py-1.5 rounded-md transition-colors"
          >
            Loan Products
          </Link>
          <Link
            href="/#architecture"
            className="text-xs sm:text-sm font-medium text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 px-3 py-1.5 rounded-md transition-colors"
          >
            Architecture
          </Link>
        </nav>
      </div>
    </header>
  );
}
