/**
 * Rotation Visualization & Controls — explains *why* products appear, using the
 * same seeded rotation helpers as the storefront. Controls only bump the
 * existing global nonce / deal priority; the algorithm itself is untouched.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Shuffle, Eye, RotateCcw, Lock, LockOpen, Loader2 } from "lucide-react";
import type { Product } from "@/lib/products";
import { triggerGlobalReshuffle } from "@/lib/use-rotation-nonce";
import { rotationReason } from "@/lib/flash/flash-health";
import { saveFlashOps, type FlashOps } from "@/lib/flash/flash-ops";

function List({ title, items, cap }: { title: string; items: Product[]; cap: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">{title}</p>
      <ol className="space-y-1.5">
        {items.slice(0, 10).map((p, i) => (
          <li key={p.slug} className="flex items-center gap-2 text-xs">
            <span className={`tabular-nums w-6 shrink-0 font-mono ${i < cap ? "text-accent" : "text-muted-foreground"}`}>
              {i + 1}
            </span>
            <span className="truncate">{p.name}</span>
          </li>
        ))}
        {items.length === 0 && <li className="text-xs text-muted-foreground">No eligible products.</li>}
      </ol>
    </div>
  );
}

export function FlashRotationPanel({
  rotation, nextRotation, prevRotation, seed, nonce, cap, ops, onChanged,
}: {
  rotation: Product[];
  nextRotation: Product[];
  prevRotation: Product[];
  seed: number;
  nonce: number;
  cap: number;
  ops: FlashOps;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showNext, setShowNext] = useState(false);

  async function reshuffle() {
    setBusy(true);
    const ok = await triggerGlobalReshuffle();
    setBusy(false);
    toast[ok ? "success" : "error"](ok ? "Rotation reshuffled for all visitors" : "Reshuffle blocked — admin access required");
    if (ok) onChanged();
  }

  async function setLocked(locked: boolean) {
    try {
      await saveFlashOps({ ...ops, heroLocked: locked });
      toast.success(locked ? "Hero order locked" : "Automatic rotation restored");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update rotation lock");
    }
  }

  const windowStart = new Date(seed - nonce);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 grid sm:grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Rotation seed</p>
          <p className="tabular-nums">{seed}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Window start (IST 6h)</p>
          <p className="tabular-nums">{windowStart.toUTCString()}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Manual nonce</p>
          <p className="tabular-nums">{nonce}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={reshuffle} disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 min-h-11 text-[11px] font-mono uppercase tracking-widest disabled:opacity-60">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />} Reshuffle now
        </button>
        <button onClick={() => setShowNext((s) => !s)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 min-h-11 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5">
          <Eye className="size-3.5" /> {showNext ? "Hide" : "Preview"} next rotation
        </button>
        {ops.heroLocked ? (
          <button onClick={() => setLocked(false)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 min-h-11 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5">
            <LockOpen className="size-3.5" /> Restore automatic rotation
          </button>
        ) : (
          <button onClick={() => setLocked(true)}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 min-h-11 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5">
            <Lock className="size-3.5" /> Lock hero order
          </button>
        )}
        <button onClick={reshuffle} disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 min-h-11 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5 disabled:opacity-60">
          <RotateCcw className="size-3.5" /> Reset rotation
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <List title="Previous window" items={prevRotation} cap={cap} />
        <List title="Current rotation" items={rotation} cap={cap} />
        {showNext && <List title="Next window" items={nextRotation} cap={cap} />}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">Why these products</p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {rotation.slice(0, 8).map((p, i) => (
            <li key={p.slug}>
              <span className="text-foreground">{p.name}</span> — {rotationReason(i, cap)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
