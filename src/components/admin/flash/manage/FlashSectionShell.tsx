/**
 * Minimal section shell for the manage-first Flash Deals page: an editorial
 * heading, an optional count and optional right-hand action, then content.
 */
import type { ReactNode } from "react";

export function FlashSectionShell({
  eyebrow, title, count, action, children,
}: {
  eyebrow?: string;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{eyebrow}</p>
          )}
          <h2 className="truncate font-display text-lg font-semibold">
            {title}
            {count != null && <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{count}</span>}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function FlashEmpty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
