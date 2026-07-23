import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — Premium UI System v4.0
 * 18px radius, neutral hairline border, quiet orange focus border. No glow.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[var(--radius-input)] border border-[color:var(--input)] bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-4 py-2 text-base text-foreground transition-colors duration-[var(--duration-fast)] file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-[color:var(--primary)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
