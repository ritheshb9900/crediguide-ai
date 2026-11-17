import React from "react";
import {
  ShieldCheck,
  Sparkles,
  Database,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDataProvider } from "@/services/data";
import { formatCurrencyINR, formatPercentage } from "@/lib/utils";
import { ChatInterface } from "@/components/chat/chat-interface";

export default async function HomePage() {
  const dataProvider = getDataProvider();
  const products = await dataProvider.getLoanProducts();

  return (
    <div className="flex flex-col gap-12 sm:gap-16 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-900 via-indigo-950 to-slate-950 text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 border-b border-indigo-900/50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10 space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" /> TCS BFSI Hackathon Prototype
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Stage 2 Engine Verified (5/5 Tests Passed)
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
              <Database className="h-3.5 w-3.5 text-indigo-400" /> Provider: {dataProvider.providerName}
            </span>
          </div>

          <div className="space-y-4 max-w-4xl">
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Automated Personal Loan{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-sky-300 to-indigo-300">
                Preliminary Eligibility
              </span>{" "}
              Assistant
            </h1>
            <p className="text-base sm:text-xl text-slate-300 max-w-3xl leading-relaxed">
              An enterprise-grade banking prototype separating conversational natural-language parsing from strict deterministic policy decisioning. Delivers instant, transparent preliminary evaluations without calculation hallucinations.
            </p>
          </div>

          {/* Value Highlights */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-2xl font-bold text-white">0%</div>
              <div className="text-xs text-slate-400 font-medium">LLM Math Hallucinations</div>
              <div className="text-[11px] text-slate-500">Pure deterministic formulas</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-2xl font-bold text-white">&lt; 2 min</div>
              <div className="text-xs text-slate-400 font-medium">Conversational Flow</div>
              <div className="text-[11px] text-slate-500">Interactive data gathering</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-2xl font-bold text-white">100%</div>
              <div className="text-xs text-slate-400 font-medium">Policy Audit Trail</div>
              <div className="text-[11px] text-slate-500">Criteria-level breakdown</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
              <div className="text-2xl font-bold text-white">Prisma 7</div>
              <div className="text-xs text-slate-400 font-medium">PostgreSQL Ready</div>
              <div className="text-[11px] text-slate-500">Structured data models</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a href="#chat-assistant">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-lg shadow-blue-900/50">
                Start Loan Eligibility Chat <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <a href="#products">
              <Button size="lg" variant="outline" className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800">
                Explore Loan Products
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Primary Chatbot Interface Section (Stage 3C Prototype) */}
      <section id="chat-assistant" className="scroll-mt-20">
        <ChatInterface />
      </section>

      {/* Architecture Separation Banner */}
      <section id="architecture" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-10">
          <Badge variant="outline" className="text-xs font-semibold px-3 py-1">
            System Design Principle
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Strict Separation of Concerns
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            By architectural mandate, generative AI is used solely for natural-language extraction and dialogue. The deterministic backend handles all mathematical evaluations and banking rules.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI Layer Card */}
          <Card className="border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50/50 to-white dark:from-slate-900 dark:to-slate-900/70">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-600 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <CardTitle>AI Conversational Layer</CardTitle>
                </div>
                <Badge variant="info">Gemini API Isolated</Badge>
              </div>
              <CardDescription>
                Handles applicant communication and unstructured text parsing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <span><strong>Natural Language Understanding:</strong> Extracts income, EMIs, age, and employment from conversational text.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <span><strong>Missing Parameter Detection:</strong> Guides applicant conversationally to supply missing financial inputs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <span><strong>Service Isolation:</strong> Abstracted behind <code>IAIService</code> so models can be swapped without backend impact.</span>
                </li>
                <li className="flex items-start gap-2 text-rose-700 dark:text-rose-400 font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span><strong>Strict Boundary:</strong> NEVER independently computes or decides final preliminary eligibility.</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Deterministic Backend Card */}
          <Card className="border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/50 to-white dark:from-slate-900 dark:to-slate-900/70">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-indigo-700 text-white">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <CardTitle>Deterministic Policy Engine</CardTitle>
                </div>
                <Badge variant="success">Stage 2 Active</Badge>
              </div>
              <CardDescription>
                Authoritative financial calculations, policy rules, and compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>Mathematical Calculations:</strong> Exact reducing-balance EMI amortization, existing FOIR, and debt headroom.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>Configurable Demonstration Rules:</strong> Validates Age (21–60), Min Income (₹30,000), Max FOIR (50%), and Tenure (1–7 yrs).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>Strict Three-State Evaluation:</strong> Generates exactly <code>ELIGIBLE</code>, <code>CONDITIONAL</code>, or <code>NOT_ELIGIBLE</code>.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span><strong>Document &amp; API Integration:</strong> Serves <code>POST /api/eligibility</code> validated with Zod schemas.</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Deterministic Evaluation Formulas & Demonstration Rules */}
      <section id="engine-tests" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-indigo-400" />
                <h3 className="text-xl font-bold">Deterministic Financial Formulas &amp; Rules</h3>
              </div>
              <p className="text-xs text-slate-300">
                Formula execution is purely mathematical and isolated from UI and AI layers.
              </p>
            </div>
            <Badge variant="warning" className="text-xs">
              Configurable Demonstration Rule: Max 50% FOIR
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-300 font-semibold">
                <span>1. Existing FOIR Formula</span>
                <Badge variant="outline" className="text-[10px] text-blue-300">Debt Ratio</Badge>
              </div>
              <p className="font-mono text-xs bg-slate-950 p-2 rounded border border-slate-800 text-emerald-400">
                FOIR = (Existing EMI / Monthly Income) &times; 100
              </p>
              <p className="text-[11px] text-slate-400">
                Example: ₹10,000 EMI on ₹60,000 income = 16.67%. Ceiling is 50.00%.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
                <span>2. Reducing-Balance EMI</span>
                <Badge variant="outline" className="text-[10px] text-indigo-300">Amortization</Badge>
              </div>
              <p className="font-mono text-xs bg-slate-950 p-2 rounded border border-slate-800 text-emerald-400">
                EMI = [P &times; r &times; (1+r)^N] / [(1+r)^N - 1]
              </p>
              <p className="text-[11px] text-slate-400">
                Where P = Principal, r = AnnualRate / 1200, N = Tenure in months.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs text-sky-300 font-semibold">
                <span>3. Maximum Borrowing Headroom</span>
                <Badge variant="outline" className="text-[10px] text-sky-300">Capacity</Badge>
              </div>
              <p className="font-mono text-xs bg-slate-950 p-2 rounded border border-slate-800 text-emerald-400">
                Headroom = (Income &times; 50%) - Existing EMI
              </p>
              <p className="text-[11px] text-slate-400">
                Present value of allowable headroom amortized over loan tenure.
              </p>
            </div>
          </div>

          {/* Test Bench Verification Matrix */}
          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Verified Deterministic Test Scenarios (Stage 2 Test Suite)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">TEST 1: Prime Salaried</span>
                  <Badge variant="success" className="text-[10px]">ELIGIBLE</Badge>
                </div>
                <p className="text-[11px] text-slate-400">Age 28, ₹60k Inc, ₹5k EMI, ₹8L loan, 5 yrs</p>
                <div className="text-[10px] text-emerald-400 font-semibold">All criteria passed (FOIR: 8.33%)</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">TEST 2: Underage</span>
                  <Badge variant="destructive" className="text-[10px]">NOT_ELIGIBLE</Badge>
                </div>
                <p className="text-[11px] text-slate-400">Age 19, ₹60k Inc, ₹5k EMI, ₹8L loan, 5 yrs</p>
                <div className="text-[10px] text-rose-400 font-semibold">Age 19 &lt; minimum 21 years</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">TEST 3: Low Income</span>
                  <Badge variant="destructive" className="text-[10px]">NOT_ELIGIBLE</Badge>
                </div>
                <p className="text-[11px] text-slate-400">Age 30, ₹25k Inc, ₹2k EMI, ₹5L loan, 5 yrs</p>
                <div className="text-[10px] text-rose-400 font-semibold">Income ₹25k &lt; minimum ₹30k</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">TEST 4: High Debt</span>
                  <Badge variant="destructive" className="text-[10px]">NOT_ELIGIBLE</Badge>
                </div>
                <p className="text-[11px] text-slate-400">Age 30, ₹60k Inc, ₹40k EMI, ₹8L loan, 5 yrs</p>
                <div className="text-[10px] text-rose-400 font-semibold">FOIR 66.67% &gt; ceiling 50.00%</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/60 border border-slate-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">TEST 5: Excessive Cap</span>
                  <Badge variant="warning" className="text-[10px]">CONDITIONAL</Badge>
                </div>
                <p className="text-[11px] text-slate-400">Age 30, ₹60k Inc, ₹5k EMI, ₹45L loan, 5 yrs</p>
                <div className="text-[10px] text-amber-300 font-semibold">Eligible up to capacity ₹11.60L</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Loan Products Showcase */}
      <section id="products" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <Badge variant="secondary" className="mb-2">
              Configured Catalog
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Pre-Configured Personal Loan Products
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Active products and policy thresholds populated via database seeds and synthetic adapters.
            </p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Database className="h-4 w-4 text-blue-600" />
            <span>Loaded from: <strong className="text-slate-800 dark:text-slate-200">{dataProvider.providerName}</strong></span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <Card key={product.id} className="flex flex-col justify-between hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {product.productCode}
                  </Badge>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Active Product
                  </span>
                </div>
                <CardTitle className="text-base text-slate-900 dark:text-white">
                  {product.name}
                </CardTitle>
                <CardDescription className="line-clamp-3 text-xs">
                  {product.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Loan Range:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatCurrencyINR(product.minAmount)} – {formatCurrencyINR(product.maxAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Tenure:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {product.minTenureMonths} – {product.maxTenureMonths} Mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Indicative Rate:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {formatPercentage(product.minInterestRate)} – {formatPercentage(product.maxInterestRate)} p.a.
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Processing Fee:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {product.processingFeePercentage}% + GST
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Core Rule Checks
                  </span>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary" className="text-[10px]">Age: 21–60 Yrs</Badge>
                    <Badge variant="secondary" className="text-[10px]">Min: ₹30k/mo</Badge>
                    <Badge variant="secondary" className="text-[10px]">FOIR &le; 50%</Badge>
                    <Badge variant="secondary" className="text-[10px]">Tenure: 1–7 Yrs</Badge>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <a href="#chat-assistant" className="w-full">
                  <Button variant="default" className="w-full text-xs font-semibold justify-between bg-blue-600 hover:bg-blue-700 text-white">
                    <span>Check Eligibility</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </a>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* Project Status & Roadmap */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Prototype Implementation Roadmap</CardTitle>
                <CardDescription>Track progress against hackathon development phases.</CardDescription>
              </div>
              <Badge variant="success">Stage 3 Completed</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">Stage 1: Core Setup</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  Next.js App Router, Prisma ORM, PostgreSQL schema, Seed dataset, UI Primitives, and Layout.
                </p>
                <div className="font-bold text-emerald-700 dark:text-emerald-400 pt-1">COMPLETED</div>
              </div>

              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">Stage 2: Deterministic Engine</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  EMI &amp; FOIR calculator, Age/Income/Tenure/Employment rules, 5/5 verified tests, and <code>POST /api/eligibility</code>.
                </p>
                <div className="font-bold text-emerald-700 dark:text-emerald-400 pt-1">COMPLETED</div>
              </div>

              <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">Stage 3: Conversational AI</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  MockAIService extraction, dynamic progress tracking, live chat interface, and deterministic orchestration.
                </p>
                <div className="font-bold text-emerald-700 dark:text-emerald-400 pt-1">COMPLETED</div>
              </div>

              <div className="p-3.5 rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-800 dark:text-blue-300">Stage 4: Verification &amp; E2E</span>
                  <Sparkles className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-slate-600 dark:text-slate-400">
                  End-to-end integration tests, multi-scenario evaluation, and comprehensive demonstration bench.
                </p>
                <div className="font-bold text-blue-700 dark:text-blue-400 pt-1">VERIFIED ACTIVE</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
