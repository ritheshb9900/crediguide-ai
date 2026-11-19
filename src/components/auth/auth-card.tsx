import * as React from "react";
import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface AuthCardProps {
  title: string;
  description?: string;
  badgeText?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  description,
  badgeText = "Enterprise Portal",
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <Card
      className={cn(
        "w-full max-w-md mx-auto shadow-md border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden",
        className
      )}
    >
      <CardHeader className="space-y-3 pb-6 text-center">
        {/* Brand Institutional Indicator */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-700 to-indigo-900 text-white shadow-sm">
            <Landmark className="h-6 w-6" aria-hidden="true" />
          </div>
          {badgeText && (
            <Badge
              variant="secondary"
              className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5"
            >
              {badgeText}
            </Badge>
          )}
        </div>

        {/* Card Heading & Subheading */}
        <div className="space-y-1">
          <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            {title}
          </CardTitle>
          {description && (
            <CardDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {description}
            </CardDescription>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">{children}</CardContent>

      {footer && (
        <CardFooter className="flex flex-col items-center justify-center border-t border-slate-100 dark:border-slate-800/80 pt-4 pb-6 text-center text-xs text-slate-600 dark:text-slate-400">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}
