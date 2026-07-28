/**
 * Saved views — admins can store the current search + filter combination as a
 * named workspace. Persisted locally; no backend involvement.
 */
import { useCallback, useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, X } from "lucide-react";

export type SavedView = { id: string; name: string; query: string; filter: string };

const KEY = "fom.flash.saved-views.v1";

const PRESETS: SavedView[] = [
  { id: "preset-today", name: "Today's deals", query: "", filter: "active" },
  { id: "preset-ending", name: "Ending soon", query: "", filter: "ending_soon" },
  { id: "preset-low", name: "Low stock", query: "", filter: "low_stock" },
  { id: "preset-ops", name: "Operations", query: "", filter: "conflict" },
];

function load(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => setViews(load()), []);

  const persist = useCallback((next: SavedView[]) => {
    setViews(next);
    try { window.localStorage.setItem(KEY, JSON.stringify(next.slice(0, 20))); } catch { /* quota */ }
  }, []);

  const save = useCallback((name: string, query: string, filter: string) => {
    persist([{ id: `v_${Date.now().toString(36)}`, name, query, filter }, ...load()]);
  }, [persist]);

  const remove = useCallback((id: string) => {
    persist(load().filter((v) => v.id !== id));
  }, [persist]);

  return { views, save, remove };
}

export function FlashSavedViews({
  views, activeFilter, onApply, onSave, onRemove,
}: {
  views: SavedView[];
  activeFilter: string;
  onApply: (v: SavedView) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  const all = [...PRESETS, ...views];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((v) => {
        const active = v.filter === activeFilter;
        return (
          <span key={v.id}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border pl-3 pr-2 text-[10px] font-mono uppercase tracking-widest transition ${
              active ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}>
            <button onClick={() => onApply(v)} className="inline-flex items-center gap-1.5">
              <Bookmark className="size-3" /> {v.name}
            </button>
            {!v.id.startsWith("preset-") && (
              <button onClick={() => onRemove(v.id)} aria-label={`Delete view ${v.name}`}
                className="grid size-6 place-items-center rounded-full hover:bg-white/10">
                <X className="size-3" />
              </button>
            )}
          </span>
        );
      })}
      <button onClick={onSave}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-white/15 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5">
        <BookmarkPlus className="size-3" /> Save view
      </button>
    </div>
  );
}
