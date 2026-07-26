import { useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, X } from "lucide-react";
import { LivePreviewPane } from "@/components/admin/product-editor/LivePreviewPane";
import type { DraftOverlay } from "@/lib/pdp-preview-channel";
import { cn } from "@/lib/utils";

/**
 * Responsive split-screen shell — Product Editor 3.5.
 *
 * Desktop: editor | resizable live preview.
 * Tablet/phone: full-width editor with a floating Preview button that opens a
 * slide-up sheet containing the same real customer page.
 */
export function LivePreviewShell({
  slug,
  overlay,
  children,
}: {
  slug: string;
  overlay: DraftOverlay;
  children: ReactNode;
}) {
  const [split, setSplit] = useState(52); // % width of the editor column
  const [sheetOpen, setSheetOpen] = useState(false);
  const dragging = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragging.current || !wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const pct = ((e.clientX - r.left) / r.width) * 100;
      setSplit(Math.min(72, Math.max(32, pct)));
    }
    function onUp() {
      dragging.current = false;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // Ctrl/Cmd+P → toggle preview.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setSheetOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div ref={wrapRef} className="flex w-full items-stretch gap-0">
        <div className="min-w-0 flex-1 xl:flex-none" style={{ width: undefined }}>
          <div className="xl:hidden">{children}</div>
          <div className="hidden xl:block" style={{ width: `${split}%` }} />
        </div>
      </div>

      {/* Desktop split */}
      <div className="hidden xl:flex xl:items-stretch xl:gap-0" ref={undefined}>
        <div className="min-w-0" style={{ width: `${split}%` }}>
          {children}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={() => {
            dragging.current = true;
            document.body.style.userSelect = "none";
          }}
          className="mx-2 w-1.5 shrink-0 cursor-col-resize rounded-full bg-white/10 transition-colors hover:bg-accent/50"
        />
        <div className="min-w-0 flex-1">
          <div className="sticky top-4 h-[calc(100vh-2rem)]">
            <LivePreviewPane slug={slug} overlay={overlay} />
          </div>
        </div>
      </div>

      {/* Floating preview button (tablet + phone) */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-4 py-2.5 text-xs font-semibold text-accent shadow-[var(--shadow-ember)] backdrop-blur-xl transition-transform active:scale-95 xl:hidden"
      >
        <Eye className="size-4" /> Preview
      </button>

      {/* Slide-up live preview */}
      <div
        className={cn(
          "fixed inset-0 z-[70] xl:hidden",
          sheetOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!sheetOpen}
      >
        <div
          onClick={() => setSheetOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300",
            sheetOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 top-6 flex flex-col gap-2 rounded-t-3xl border border-white/10 bg-[#050608] p-3 transition-transform duration-300 will-change-transform",
            sheetOpen ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Live customer preview
            </p>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close preview"
              className="grid size-8 place-items-center rounded-full border border-white/10 text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {sheetOpen && <LivePreviewPane slug={slug} overlay={overlay} className="min-h-0 flex-1" />}
        </div>
      </div>
    </>
  );
}
