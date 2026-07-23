import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textarea — Premium UI System v4.0
 * 18px radius, neutral hairline border, quiet orange focus border. No glow.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-[var(--radius-input)] border border-[color:var(--input)] bg-[color-mix(in_oklab,var(--card)_60%,transparent)] px-4 py-3 text-base text-foreground transition-colors duration-[var(--duration-fast)] placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-[color:var(--primary)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
