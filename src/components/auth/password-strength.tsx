import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single requirement evaluated against the password string.
 */
export interface PasswordCriterion {
  id: string;
  label: string;
  met: boolean;
}

export type PasswordStrengthLevel = "Weak" | "Moderate" | "Strong";

export interface PasswordStrengthEvaluation {
  score: number;
  criteria: PasswordCriterion[];
  isLengthValid: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  strengthLevel: PasswordStrengthLevel;
  isValid: boolean;
}

/**
 * Pure evaluation function strictly matching backend PasswordSchema in src/lib/auth/validation.ts:
 * 1. Min 8 characters, max 128 characters
 * 2. At least one uppercase letter (/[A-Z]/)
 * 3. At least one lowercase letter (/[a-z]/)
 * 4. At least one digit (/[0-9]/)
 * 5. At least one special character (/[^A-Za-z0-9]/)
 */
export function evaluatePasswordStrength(password: string = ""): PasswordStrengthEvaluation {
  const pwd = typeof password === "string" ? password : "";

  const isLengthValid = pwd.length >= 8 && pwd.length <= 128;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(pwd);

  const criteria: PasswordCriterion[] = [
    {
      id: "length",
      label: "Between 8 and 128 characters",
      met: isLengthValid,
    },
    {
      id: "uppercase",
      label: "At least one uppercase letter (A-Z)",
      met: hasUppercase,
    },
    {
      id: "lowercase",
      label: "At least one lowercase letter (a-z)",
      met: hasLowercase,
    },
    {
      id: "number",
      label: "At least one number (0-9)",
      met: hasNumber,
    },
    {
      id: "special",
      label: "At least one special character (e.g. !@#$%^&*)",
      met: hasSpecialChar,
    },
  ];

  const score = criteria.filter((c) => c.met).length;

  let strengthLevel: PasswordStrengthLevel = "Weak";
  if (score === 5) {
    strengthLevel = "Strong";
  } else if (score >= 3) {
    strengthLevel = "Moderate";
  } else {
    strengthLevel = "Weak";
  }

  return {
    score,
    criteria,
    isLengthValid,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    strengthLevel,
    isValid: score === 5,
  };
}

export interface PasswordStrengthProps {
  password?: string;
  className?: string;
  showCriteriaList?: boolean;
}

export function PasswordStrength({
  password = "",
  className,
  showCriteriaList = true,
}: PasswordStrengthProps) {
  const evaluation = evaluatePasswordStrength(password);
  const { score, criteria, strengthLevel } = evaluation;

  // Visual bar styling based on strength level
  const getBarColor = () => {
    if (score === 0) return "bg-slate-200 dark:bg-slate-800";
    if (strengthLevel === "Strong") return "bg-emerald-600 dark:bg-emerald-500";
    if (strengthLevel === "Moderate") return "bg-amber-500 dark:bg-amber-400";
    return "bg-rose-500 dark:bg-rose-400";
  };

  const getTextColor = () => {
    if (score === 0) return "text-slate-500 dark:text-slate-400";
    if (strengthLevel === "Strong") return "text-emerald-700 dark:text-emerald-400";
    if (strengthLevel === "Moderate") return "text-amber-700 dark:text-amber-400";
    return "text-rose-700 dark:text-rose-400";
  };

  const progressPercent = (score / 5) * 100;

  return (
    <div className={cn("space-y-3 w-full", className)}>
      {/* Progress Bar & Header */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-600 dark:text-slate-400">Password complexity</span>
          <span className={cn("font-semibold", getTextColor())}>
            {score === 0 ? "Not entered" : `${strengthLevel} (${score}/5 met)`}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-label="Password strength"
          aria-valuetext={
            score === 0
              ? "Password not entered"
              : `${strengthLevel} complexity: ${score} of 5 requirements satisfied`
          }
          className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        >
          <div
            className={cn("h-full transition-all duration-300 ease-out", getBarColor())}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Criteria Checklist */}
      {showCriteriaList && (
        <ul
          aria-label="Password requirements"
          aria-live="polite"
          className="space-y-1.5 pt-1 text-xs text-slate-600 dark:text-slate-400"
        >
          {criteria.map((criterion) => (
            <li
              key={criterion.id}
              className={cn(
                "flex items-center gap-2 transition-colors",
                criterion.met
                  ? "text-emerald-700 dark:text-emerald-400 font-medium"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <span className="sr-only">
                {criterion.met ? "Requirement fulfilled:" : "Requirement not fulfilled:"}
              </span>
              {criterion.met ? (
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <X
                  className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                />
              )}
              <span>{criterion.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
