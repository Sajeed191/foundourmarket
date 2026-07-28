/**
 * Floating quick-action toolbar for the Flash Deals manage page.
 * Sticks to the bottom on mobile, stays out of the way on desktop.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Shuffle, Settings2, Download, Pause, Loader2 } from "lucide-react";
import { triggerGlobalReshuffle } from "@/lib/use-rotation-nonce";

export function FlashQuickBar({
  onNew, onSettings, onExport, onPauseAll, onReshuffled,
}: {
  onNew: () => void;
  onSettings: () => void;
  onExport: () => void;
  onPauseAll: () => void;
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

  const item = "inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 min-h-11 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5 transition";

  return (
    <div className="sticky bottom-3 z-30 mt-6">
      <div className="mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-border bg-card/90 p-1.5 backdrop-blur-xl shadow-2xl">
        <button onClick={onNew}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent-foreground hover:opacity-90 transition">
          <Plus className="size-3.5" /> New deal
        </button>
        <button onClick={() => void reshuffle()} disabled={busy} className={item}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />} Reshuffle
        </button>
        <button onClick={onPauseAll} className={item}><Pause className="size-3.5" /> Pause all</button>
        <button onClick={onExport} className={item}><Download className="size-3.5" /> Export</button>
        <button onClick={onSettings} className={item}><Settings2 className="size-3.5" /> Settings</button>
      </div>
    </div>
  );
}
