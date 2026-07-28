/**
 * Sticky quick-action toolbar. Always visible while managing deals.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Shuffle, Eye, Undo2, SquarePen, Trash2, Loader2 } from "lucide-react";
import { triggerGlobalReshuffle } from "@/lib/use-rotation-nonce";

export function FlashQuickBar({
  selectedCount, canUndo, onNew, onBulkEdit, onBulkDelete, onPreview, onUndo, onReshuffled,
}: {
  selectedCount: number;
  canUndo: boolean;
  onNew: () => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
  onPreview: () => void;
  onUndo: () => void;
  onReshuffled: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function reshuffle() {
    setBusy(true);
    const ok = await triggerGlobalReshuffle();
    setBusy(false);
    toast[ok ? "success" : "error"](ok ? "Rotation reshuffled for all visitors" : "Reshuffle blocked — admin access required");
    if (ok) onReshuffled();
  }

  const item = "inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 min-h-11 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5 transition disabled:opacity-40";

  return (
    <div className="sticky bottom-3 z-30 mt-6">
      <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-border bg-card/90 p-1.5 shadow-2xl backdrop-blur-xl">
        <button onClick={onNew}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90">
          <Plus className="size-3.5" /> New deal
        </button>
        <button onClick={onBulkEdit} disabled={selectedCount === 0} className={item}>
          <SquarePen className="size-3.5" /> Bulk edit{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </button>
        <button onClick={onBulkDelete} disabled={selectedCount === 0}
          className={`${item} border-destructive/30 text-destructive hover:bg-destructive/10`}>
          <Trash2 className="size-3.5" /> Bulk delete
        </button>
        <button onClick={() => void reshuffle()} disabled={busy} className={item}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />} Reshuffle
        </button>
        <button onClick={onPreview} className={item}><Eye className="size-3.5" /> Preview</button>
        <button onClick={onUndo} disabled={!canUndo} className={item}><Undo2 className="size-3.5" /> Undo</button>
      </div>
    </div>
  );
}
