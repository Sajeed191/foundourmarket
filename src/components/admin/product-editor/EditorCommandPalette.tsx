import { useEffect, useMemo, useRef, useState } from "react";
import { Command, Search, CornerDownLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type EditorCommand = {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon;
  hint?: string;
  run: () => void;
};

/**
 * Editor Command Palette (Ctrl/Cmd + K) — Product Editor 6.0.
 *
 * Presentation-only launcher over actions the editor already exposes.
 * Keyboard-first, no bounce animations, respects reduced motion.
 */
export function EditorCommandPalette({ commands }: { commands: EditorCommand[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(needle) || c.group.toLowerCase().includes(needle),
    );
  }, [commands, q]);

  const groups = useMemo(() => {
    const map = new Map<string, EditorCommand[]>();
    for (const c of results) map.set(c.group, [...(map.get(c.group) ?? []), c]);
    return [...map.entries()];
  }, [results]);

  function runAt(index: number) {
    const cmd = results[index];
    if (!cmd) return;
    setOpen(false);
    cmd.run();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button
        type="button"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/12 bg-[#0b0d12] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-3.5 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); runAt(cursor); }
            }}
            placeholder="Search actions — publish, generate SEO, jump to images…"
            aria-label="Search editor actions"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <span className="hidden shrink-0 items-center gap-1 rounded-md border border-white/12 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-flex">
            <Command className="size-3" />K
          </span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No matching action.</p>
          )}
          {groups.map(([group, items]) => (
            <div key={group}>
              <p className="px-3.5 pb-1 pt-2 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                {group}
              </p>
              {items.map((c) => {
                const index = results.indexOf(c);
                const active = index === cursor;
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => runAt(index)}
                    className={`grid w-full min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3.5 py-2 text-left transition-colors duration-150 ${
                      active ? "bg-accent/12 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <Icon className={`size-4 shrink-0 ${active ? "text-accent" : ""}`} />
                    <span className="min-w-0 truncate text-[13px] font-medium">{c.label}</span>
                    {active ? (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{c.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
