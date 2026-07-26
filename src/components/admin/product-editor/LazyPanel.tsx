import { Component, Suspense, useCallback, useState, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Product Editor 8.0 — resilient lazy panel.
 *
 * Wraps a lazily-loaded editor module with a consistent shimmer skeleton and a
 * localized retry surface. A failed chunk never unmounts the editor, never
 * touches draft state, and never blocks editing — only this panel degrades.
 */

class PanelBoundary extends Component<
  { children: ReactNode; fallback: (retry: () => void, error: Error) => ReactNode; resetKey: number },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: number }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(() => this.setState({ error: null }), this.state.error);
    }
    return this.props.children;
  }
}

export function PanelSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div
      className={`editor-surface editor-skeleton p-4 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading panel…</span>
      <div className="space-y-2.5">
        <div className="editor-shimmer h-3 w-1/3 rounded" />
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="editor-shimmer h-2.5 rounded" style={{ width: `${88 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

export function LazyPanel({
  children,
  name,
  lines = 3,
  className,
}: {
  children: ReactNode;
  /** Human name used in the retry message, e.g. "Publishing Center". */
  name: string;
  lines?: number;
  className?: string;
}) {
  const [resetKey, setResetKey] = useState(0);
  const retryAll = useCallback(() => setResetKey((k) => k + 1), []);

  return (
    <PanelBoundary
      resetKey={resetKey}
      fallback={(retry) => (
        <div className={`editor-surface p-4 ${className ?? ""}`} role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{name} couldn&apos;t load</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your edits are safe. The rest of the editor keeps working.
              </p>
              <button
                type="button"
                onClick={() => {
                  retry();
                  retryAll();
                }}
                className="editor-motion mt-3 inline-flex h-11 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-4 text-xs font-semibold hover:border-white/25 active:scale-[0.98]"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" /> Try again
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <Suspense fallback={<PanelSkeleton lines={lines} className={className} />}>
        <div key={resetKey}>{children}</div>
      </Suspense>
    </PanelBoundary>
  );
}
