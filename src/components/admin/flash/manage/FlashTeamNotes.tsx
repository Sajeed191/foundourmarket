/**
 * v11.0 — Team Notes. Lightweight, presentation-only internal notes stored in
 * local workspace preferences. No backend, no sharing, no schema changes.
 */
import { useState } from "react";
import { StickyNote, Plus, X } from "lucide-react";
import type { TeamNote } from "@/lib/flash/use-flash-workspace";

function when(at: number) {
  return new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function FlashTeamNotes({
  notes, onAdd, onRemove,
}: {
  notes: TeamNote[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <section aria-label="Team notes" className="space-y-2">
      <p className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
        <StickyNote className="size-3.5" /> Team notes
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = text.trim();
          if (!v) return;
          onAdd(v);
          setText("");
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note for the team…"
          aria-label="New team note"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[0.03] px-4 text-[13px] outline-none transition placeholder:text-muted-foreground focus:border-accent/40"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-accent/40 px-4 text-[10px] font-mono uppercase tracking-widest text-accent transition hover:bg-accent/10"
        >
          <Plus className="size-3.5" /> Add
        </button>
      </form>

      {notes.length > 0 && (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-2xl border border-border bg-card p-3">
              <div className="min-w-0">
                <p className="text-[13px] leading-relaxed">{n.text}</p>
                <p className="mt-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{when(n.at)}</p>
              </div>
              <button
                onClick={() => onRemove(n.id)}
                aria-label="Delete note"
                className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-white/5"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
