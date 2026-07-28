/**
 * v10.0 — Sticky command center. Every high-frequency operation within one
 * tap, single-thumb friendly on phones. Actions delegate to the page.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Plus, Shuffle, Eye, Undo2, Redo2, Search, Trash2, Loader2, Check, X,
  Sparkles, Download, MoreHorizontal,
} from "lucide-react";
import { triggerGlobalReshuffle } from "@/lib/use-rotation-nonce";

export function FlashCommandBar({
  selectedCount, pendingCount, canUndo, canRedo,
  onNew, onSearch, onPreview, onUndo, onRedo, onBulkApprove, onBulkReject,
  onBulkDelete, onGenerateCampaign, onExport, onReshuffled,
}: {
  selectedCount: number;
  pendingCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onSearch: () => void;
  onPreview: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onBulkApprove: () => void;
  onBulkReject: () => void;
  onBulkDelete: () => void;
  onGenerateCampaign: () => void;
  onExport: () => void;
  onReshuffled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);

  async function reshuffle() {
    setBusy(true);
    const ok = await triggerGlobalReshuffle();
    setBusy(false);
    toast[ok ? "success" : "error"](ok ? "Rotation reshuffled for all visitors" : "Reshuffle blocked — admin access required");
    if (ok) onReshuffled();
  }

  const item = "inline-flex items-center gap-2 rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5 transition disabled:opacity-40";
  const icon = "grid size-11 shrink-0 place-items-center rounded-full border border-white/10 text-muted-foreground hover:bg-white/5 transition disabled:opacity-40";

  return (
    <div className="sticky bottom-3 z-30 mt-6 print:hidden">
      {more && (
        <div className="mx-auto mb-2 flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-3xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-xl">
          <button onClick={onBulkApprove} disabled={pendingCount === 0} className={item}>
            <Check className="size-3.5" /> Approve all ({pendingCount})
          </button>
          <button onClick={onBulkReject} disabled={pendingCount === 0} className={item}>
            <X className="size-3.5" /> Reject all
          </button>
          <button onClick={onGenerateCampaign} className={item}><Sparkles className="size-3.5" /> Generate campaign</button>
          <button onClick={() => void reshuffle()} disabled={busy} className={item}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />} Reshuffle
          </button>
          <button onClick={onExport} className={item}><Download className="size-3.5" /> Export</button>
          <button onClick={onRedo} disabled={!canRedo} className={item}><Redo2 className="size-3.5" /> Redo</button>
          <button onClick={onBulkDelete} disabled={selectedCount === 0}
            className={`${item} border-destructive/30 text-destructive hover:bg-destructive/10`}>
            <Trash2 className="size-3.5" /> Delete ({selectedCount})
          </button>
        </div>
      )}

      <div className="mx-auto flex w-fit max-w-full items-center justify-center gap-1.5 rounded-full border border-border bg-card/90 p-1.5 shadow-2xl backdrop-blur-xl">
        <button onClick={onNew}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90">
          <Plus className="size-3.5" /> New
        </button>
        <button onClick={onSearch} aria-label="Search deals" className={icon}><Search className="size-4" /></button>
        <button onClick={onPreview} aria-label="Preview storefront" className={icon}><Eye className="size-4" /></button>
        <button onClick={onUndo} disabled={!canUndo} aria-label="Undo" className={icon}><Undo2 className="size-4" /></button>
        <button onClick={() => setMore((v) => !v)} aria-expanded={more} aria-label="More actions"
          className={`${icon} ${more ? "border-accent/40 text-accent" : ""}`}>
          <MoreHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}
