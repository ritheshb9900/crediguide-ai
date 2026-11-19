import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required = false, children, htmlFor, ...props }, ref) => {
    return (
      <label
        ref={ref}
        htmlFor={htmlFor}
        className={cn(
          "text-sm font-medium leading-none text-slate-800 dark:text-slate-200 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 select-none flex items-center gap-1",
          className
        )}
        {...props}
      >
        <span>{children}</span>
        {required && (
          <span className="text-red-500 font-bold" aria-hidden="true">
            *
          </span>
        )}
      </label>
    );
  }
);
Label.displayName = "Label";

export { Label };
