import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  MessageCircleQuestion,
  Loader2,
  Send,
  Search,
  ShieldCheck,
  CheckCircle2,
  ThumbsUp,
  MoreHorizontal,
  X,
  Pin,
  EyeOff,
  Trash2,
  Reply,
  Pencil,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { ProductFaq } from "@/lib/product-faqs";


/* ----------------------------- Types ----------------------------- */

type Answer = {
  id: string;
  question_id: string;
  parent_answer_id: string | null;
  user_id: string;
  body: string;
  is_official: boolean;
  is_store_response: boolean;
  helpful_count: number;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
  author_name: string | null;
  author_avatar: string | null;
};

type Question = {
  id: string;
  product_slug: string;
  question: string;
  details: string | null;
  is_anonymous: boolean;
  status: string;
  helpful_count: number;
  created_at: string;
  is_mine: boolean;
  author_name: string | null;
  author_avatar: string | null;
  answers: Answer[];
};

type Sort = "newest" | "oldest" | "helpful" | "official" | "answered" | "unanswered";

/* --------------------- Platform identity badges ---------------------
 * v6.1 — FoundOurMarket™ is currently first-party only. Answers surface
 * ONE primary identity badge, priority:
 *   1. FoundOurMarket™ Official  (admin-marked official pinned answer)
 *   2. Product Team              (reserved — future role split)
 *   3. Customer Care             (reserved — future role split)
 *   4. Verified Buyer            (reserved — future purchase check)
 *   5. Community                 (non-store answers, future)
 * Today the schema only tells us `is_official` / `is_store_response`, so
 * store/official answers collapse to the FoundOurMarket™ Official badge.
 * Extra vendor badges can be added later without touching this contract.
 */
type BadgeKind = "official" | "product_team" | "customer_care" | "verified_buyer" | "community";

function pickAnswerBadge(a: Answer): BadgeKind | null {
  if (a.is_official || a.is_store_response) return "official";
  // v6.2 — FoundOurMarket™ is first-party only; no visible community badge today.
  return null;
}

function PlatformBadge({ kind }: { kind: BadgeKind }) {
  const map = {
    official: {
      label: "FoundOurMarket™ Official",
      cls: "border-accent/30 bg-accent/12 text-accent",
      icon: <ShieldCheck className="size-2.5" />,
    },
    product_team: {
      label: "Product Team",
      cls: "border-sky-500/25 bg-sky-500/10 text-sky-300",
      icon: <ShieldCheck className="size-2.5" />,
    },
    customer_care: {
      label: "Customer Care",
      cls: "border-violet-500/25 bg-violet-500/10 text-violet-300",
      icon: <ShieldCheck className="size-2.5" />,
    },
    verified_buyer: {
      label: "Verified Buyer",
      cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
      icon: <CheckCircle2 className="size-2.5" />,
    },
    community: {
      label: "Community",
      cls: "border-white/10 bg-white/[0.04] text-muted-foreground",
      icon: <MessageCircleQuestion className="size-2.5" />,
    },
  } as const;
  const b = map[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${b.cls}`}>
      {b.icon} {b.label}
    </span>
  );
}

type QuestionDraft = {
  id?: string;
  question: string;
  details: string;
  is_anonymous: boolean;
};

/* ----------------------------- Utils ----------------------------- */

const AVATAR_PALETTE = [
  "bg-amber-500/15 text-amber-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-sky-500/15 text-sky-300",
  "bg-violet-500/15 text-violet-300",
  "bg-rose-500/15 text-rose-300",
  "bg-teal-500/15 text-teal-300",
];
function avatarSwatch(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function relDate(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** v6.3 — answer timestamps: "Answered today", "Answered N days ago", "Answered Jul 25". */
function answeredOn(iso: string) {
  const d = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((startOfToday.getTime() - d.getTime()) / (86400 * 1000));
  if (days <= 0) return "Answered today";
  if (days === 1) return "Answered yesterday";
  if (days < 7) return `Answered ${days} days ago`;
  return `Answered ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** v6.3 — lightweight token-overlap scorer for FAQ/duplicate suggestions. */
const STOP = new Set(["the","a","an","is","are","of","for","on","in","to","and","or","with","this","that","it","do","does","can","i","my","me","you","your","have","has","how","what","when","where","why","if","be","will"]);
function scoreOverlap(query: string, text: string): number {
  const q = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
  if (!q.length) return 0;
  const t = text.toLowerCase();
  let hits = 0;
  for (const w of q) if (t.includes(w)) hits += 1;
  return hits / q.length;
}



function friendlyError(err: unknown, fallback: string) {
  const msg = String((err as { message?: string })?.message ?? "");
  if (/row-level security|permission denied|policy/i.test(msg)) {
    return "You don't have permission to perform this action.";
  }
  return fallback;
}

function Avatar({ name, url, size = 36 }: { name: string; url?: string | null; size?: number }) {
  const swatch = avatarSwatch(name);
  return (
    <div
      className={`shrink-0 rounded-full overflow-hidden grid place-items-center font-display font-semibold text-sm ring-1 ring-white/10 ${url ? "bg-muted" : swatch}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img loading="lazy" decoding="async" src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span>{name.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

/* --------------------- Ask / Edit Question Modal ------------------ */

function QuestionModal({
  open,
  onClose,
  productSlug,
  initial,
  onSubmitted,
  faqSuggestions = [],
  questionSuggestions = [],
  onFaqSuggestionSelect,
  onQuestionSuggestionSelect,
}: {
  open: boolean;
  onClose: () => void;
  productSlug: string;
  initial: QuestionDraft | null;
  onSubmitted: () => void;
  faqSuggestions?: ProductFaq[];
  questionSuggestions?: Question[];
  onFaqSuggestionSelect?: (id: string) => void;
  onQuestionSuggestionSelect?: (id: string) => void;
}) {

  const { user } = useAuth();
  const navigate = useNavigate();
  const isEdit = !!initial?.id;
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<{ q: string; anon: boolean }>({ q: "", anon: false });
  const submittingRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setMounted(false);
      submittingRef.current = false;
      return;
    }
    const q = initial?.question ?? "";
    const a = initial?.is_anonymous ?? false;
    setQuestion(q);
    setDetails(initial?.details ?? "");
    setAnon(a);
    setInitialSnapshot({ q, anon: a });
    // Trigger open animation on next frame
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [open, initial]);

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(140, el.scrollHeight) + "px";
  }, [question, open]);

  if (!open) return null;

  const trimmed = question.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 5;
  const tooLong = trimmed.length > 500;
  const invalid = !trimmed || tooShort || tooLong;
  const changed = isEdit
    ? trimmed !== initialSnapshot.q.trim() || anon !== initialSnapshot.anon
    : trimmed.length > 0;
  const canSubmit = !busy && !invalid && changed;
  const validationMsg = !trimmed
    ? ""
    : tooShort
      ? "Please write at least 5 characters."
      : tooLong
        ? "Please keep your question under 500 characters."
        : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!canSubmit) return;
    if (submittingRef.current) return;
    if (!user) {
      navigate({ to: "/auth", search: { redirect: window.location.pathname } });
      onClose();
      return;
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      if (isEdit && initial?.id) {
        // Edit mode: only question + anonymous flag. Existing details in the DB
        // are preserved untouched (not editable here per v2 spec).
        const { error } = await supabase
          .from("product_questions")
          .update({ question: text, is_anonymous: false })
          .eq("id", initial.id);
        if (error) throw error;
        toast.success("Question updated successfully.");
      } else {
        const { error } = await supabase.from("product_questions").insert({
          product_slug: productSlug,
          user_id: user.id,
          question: text,
          details: details.trim() || null,
          is_anonymous: false,
        });
        if (error) throw error;
        toast.success("Question submitted");
      }
      onSubmitted();
      onClose();
    } catch (err) {
      console.error("[QA] submit failed", err);
      toast.error(friendlyError(err, isEdit ? "Couldn't update your question." : "Couldn't submit your question."));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <QuestionModalShell open={open} mounted={mounted} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col h-full">
        {/* Header */}
        <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 grid place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
            style={{ width: 44, height: 44 }}
          >
            <X className="size-[18px]" />
          </button>
          <h3 className="text-[20px] font-display font-semibold text-foreground leading-tight pr-10">
            {isEdit ? "Edit Question" : "Ask a Question"}
          </h3>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed pr-10">
            {isEdit
              ? "Update your question before saving."
              : "Our FoundOurMarket™ team typically responds within 24–48 hours."}
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-2 min-h-0">
          <div className="relative">
            <textarea
              ref={taRef}
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder={isEdit ? "What would you like to update?" : "What would you like to know about this product?"}
              aria-label={isEdit ? "Edit your question" : "Your question"}
              aria-invalid={!!validationMsg}
              className="w-full text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none transition-colors"
              style={{
                minHeight: 160,
                background: "#0E1116",
                border: `1px solid ${validationMsg ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 18,
                padding: 18,
                paddingBottom: question.length > 0 ? 32 : 18,
                fontSize: 16,
                lineHeight: 1.7,
              }}
              onFocus={(e) => {
                if (!validationMsg) e.currentTarget.style.borderColor = "var(--color-accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = validationMsg
                  ? "rgba(239,68,68,0.45)"
                  : "rgba(255,255,255,0.08)";
              }}
            />
            {question.length > 0 && (
              <div className="pointer-events-none absolute right-4 bottom-3 text-[11px] tabular-nums text-muted-foreground/70">
                {question.length} / 500
              </div>
            )}
          </div>

          {validationMsg && (
            <p className="mt-2 text-[12px]" style={{ color: "#f97a7a" }}>{validationMsg}</p>
          )}

          {/* v6.3 — live FAQ auto-link + duplicate detection (customer-only, not shown while editing) */}
          {!isEdit && trimmed.length >= 5 && (() => {
            const faqs = faqSuggestions
              .map((f) => ({ f, s: Math.max(scoreOverlap(trimmed, f.question), scoreOverlap(trimmed, f.answer) * 0.6) }))
              .filter((x) => x.s >= 0.4)
              .sort((a, b) => b.s - a.s)
              .slice(0, 3);
            const dupes = questionSuggestions
              .map((q) => ({ q, s: scoreOverlap(trimmed, q.question) }))
              .filter((x) => x.s >= 0.5 && x.q.answers.length > 0)
              .sort((a, b) => b.s - a.s)
              .slice(0, 3);
            if (faqs.length === 0 && dupes.length === 0) return null;
            return (
              <div className="mt-3 space-y-3">
                {faqs.length > 0 && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3.5">
                    <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-emerald-300/90 mb-2">
                      You may already have your answer
                    </p>
                    <ul className="space-y-1.5">
                      {faqs.map(({ f }) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            onClick={() => { onFaqSuggestionSelect?.(f.id); onClose(); }}
                            className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-emerald-500/[0.08] transition text-[13px] leading-snug text-foreground"
                          >
                            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                            <span className="min-w-0">{f.question}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {dupes.length > 0 && (
                  <div className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-3.5">
                    <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-accent mb-2">
                      Similar questions already answered
                    </p>
                    <ul className="space-y-1.5">
                      {dupes.map(({ q }) => (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() => { onQuestionSuggestionSelect?.(q.id); onClose(); }}
                            className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/[0.08] transition text-[13px] leading-snug text-foreground"
                          >
                            <MessageCircleQuestion className="mt-0.5 size-3.5 shrink-0 text-accent" />
                            <span className="min-w-0">{q.question}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Only editing the question is allowed in edit mode (v2 spec). */}
          {!isEdit && (
            <div className="mt-3">
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Add any context that would help someone answer (optional)…"
                aria-label="Optional details"
                className="w-full text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none"
                style={{
                  background: "#0E1116",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: 14,
                  fontSize: 14,
                  lineHeight: 1.6,
                }}
              />
            </div>
          )}

        </div>


        {/* Sticky footer */}
        <div
          className="px-5 sm:px-6 pt-4 pb-5 flex items-center justify-end gap-3"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center px-5 rounded-2xl text-[14px] font-medium text-foreground/85 hover:text-foreground transition-colors"
            style={{ height: 46, minWidth: 96, border: "1px solid rgba(255,255,255,0.10)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label={isEdit ? "Save changes" : "Submit question"}
            className="inline-flex items-center justify-center gap-2 px-6 text-[14px] font-semibold transition disabled:cursor-not-allowed"
            style={{
              height: 46,
              minWidth: 132,
              borderRadius: 16,
              color: canSubmit ? "#050608" : "rgba(255,255,255,0.55)",
              background: canSubmit
                ? "linear-gradient(135deg,#ff9f43 0%, #ff8a2a 55%, #f07d00 100%)"
                : "rgba(255,255,255,0.08)",
              boxShadow: canSubmit ? "0 10px 26px -16px rgba(255,138,42,0.55)" : "none",
            }}
          >
            {busy && (
              <span
                className="inline-block rounded-full animate-spin"
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(5,6,8,0.35)",
                  borderTopColor: "#050608",
                }}
              />
            )}
            {busy ? "Saving…" : isEdit ? "Save Changes" : user ? "Submit" : "Sign in to submit"}
          </button>
        </div>
      </form>
    </QuestionModalShell>
  );
}

/* Shell: mobile bottom sheet on small screens, centered dialog on desktop.
   Handles body-scroll lock, ESC-to-close, and safe-area rounding. */
function QuestionModalShell({
  open,
  mounted,
  onClose,
  children,
}: {
  open: boolean;
  mounted: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex sm:items-center items-end justify-center sm:p-4"
      onClick={onClose}
      style={{
        background: "rgba(5,6,8,0.72)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        opacity: mounted ? 1 : 0,
        transition: "opacity 180ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:w-[560px] sm:max-w-[560px] max-h-[92dvh] flex flex-col rounded-t-[28px] sm:rounded-[24px]"
        style={{
          background: "#121316",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px -30px rgba(0,0,0,0.85), 0 8px 24px -14px rgba(0,0,0,0.55)",
          transform: mounted ? "translateY(0) scale(1)" : "translateY(24px) scale(0.98)",
          opacity: mounted ? 1 : 0,
          transition: "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------ Question actions menu ------------------- */

function QuestionMenu({
  isAdmin,
  isMine,
  onEdit,
  onDelete,
  onReply,
  onHide,
}: {
  isAdmin: boolean;
  isMine: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReply?: () => void;
  onHide?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Nothing to show
  if (!isAdmin && !isMine) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Question actions"
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-card shadow-xl z-10 overflow-hidden text-sm">
          {(isMine || isAdmin) && (
            <button onClick={() => { setOpen(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
          {isAdmin && onReply && (
            <button onClick={() => { setOpen(false); onReply(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
              <Reply className="size-3.5" /> Reply
            </button>
          )}
          {isAdmin && onHide && (
            <button onClick={() => { setOpen(false); onHide(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
              <EyeOff className="size-3.5" /> Hide
            </button>
          )}
          {(isMine || isAdmin) && (
            <button onClick={() => { setOpen(false); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left text-destructive border-t border-border">
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Answer row -------------------------- */

function AnswerRow({
  answer,
  isAdmin,
  isReply,
  voted,
  onVote,
  onDelete,
  onEdit,
  onMarkOfficial,
  onReply,
  onHide,
}: {
  answer: Answer;
  isAdmin: boolean;
  isReply?: boolean;
  voted: boolean;
  onVote: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onMarkOfficial?: () => void;
  onReply?: () => void;
  onHide: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const store = answer.is_store_response;
  const official = answer.is_official;
  const badge = pickAnswerBadge(answer);
  const name = answer.author_name || (store || official ? "FoundOurMarket™ Team" : "Customer");
  // Answers are ONLY editable/deletable/moderated by admins (customers can't answer at all).
  const canManage = isAdmin;

  return (
    <div
      className={`${isReply ? "ml-8" : ""} rounded-[14px] border ${
        official
          ? "bg-accent/[0.06] border-accent/25"
          : store
          ? "bg-accent/[0.04] border-accent/15"
          : "bg-background/40 border-border/60"
      }`}
    >
      {official && !isReply && (
        <div className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[10px] font-mono uppercase tracking-[0.22em] text-accent">
          <Pin className="size-3" /> Official Answer
        </div>
      )}
      <div className="p-3.5 flex items-start gap-3">
        <Avatar name={name} url={answer.author_avatar} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-display truncate">{name}</span>
            {badge && <PlatformBadge kind={badge} />}
            <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">
              {answeredOn(answer.created_at)}
            </span>

          </div>
          <p className="text-sm leading-relaxed mt-1.5 break-words whitespace-pre-wrap">{answer.body}</p>

          <div className="mt-2.5 flex items-center gap-1.5">
            <button
              onClick={onVote}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono transition ${
                voted ? "bg-accent/15 text-accent border border-accent/25" : "border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
              aria-pressed={voted}
              aria-label="Helpful"
            >
              <ThumbsUp className="size-3" />
              <span>{answer.helpful_count > 0 ? answer.helpful_count : "Helpful"}</span>
            </button>

            {isAdmin && !isReply && onReply && (
              <button onClick={onReply} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-mono border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition">
                <Reply className="size-3" /> Reply
              </button>
            )}

            {canManage && (
              <div ref={menuRef} className="relative ml-auto">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More"
                  className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                >
                  <MoreHorizontal className="size-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-card shadow-xl z-10 overflow-hidden text-sm">
                    <button onClick={() => { setMenuOpen(false); onEdit(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
                      <Pencil className="size-3.5" /> Edit
                    </button>
                    {!isReply && onMarkOfficial && (
                      <button onClick={() => { setMenuOpen(false); onMarkOfficial(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
                        <Pin className="size-3.5" /> {official ? "Unpin official" : "Mark official"}
                      </button>
                    )}
                    <button onClick={() => { setMenuOpen(false); onHide(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left">
                      <EyeOff className="size-3.5" /> Hide
                    </button>
                    <button onClick={() => { setMenuOpen(false); onDelete(); }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 text-left text-destructive border-t border-border">
                      <Trash2 className="size-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Main component ---------------------- */

const PAGE_SIZE = 8;

export function ProductQA({
  productSlug,
  hideHeader = false,
  externalSearch,
  hideAskCta = false,
  hideEmptyState = false,
  askOpen: askOpenProp,
  onAskOpenChange,
  onCountChange,
}: {
  productSlug: string;
  /** Hide internal heading/subtitle/chips/top ask button (used when embedded in a unified section). */
  hideHeader?: boolean;
  /** When provided, ProductQA uses this search string and hides its own search input. */
  externalSearch?: string;
  /** Suppress internal Ask CTA (parent renders the single CTA). */
  hideAskCta?: boolean;
  /** Suppress internal empty state (parent renders a unified empty state). */
  hideEmptyState?: boolean;
  /** Controlled Ask modal open state. */
  askOpen?: boolean;
  onAskOpenChange?: (open: boolean) => void;
  /** Notifies parent of the current question count (post-filter-source, pre-search). */
  onCountChange?: (count: number) => void;
}) {

  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Question[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [internalSearch, setInternalSearch] = useState("");
  const search = externalSearch ?? internalSearch;
  const setSearch = (v: string) => setInternalSearch(v);
  const sortKey = `fom.qa.sort.${productSlug}`;
  const [sort, setSort] = useState<Sort>(() => {
    if (typeof window === "undefined") return "newest";
    const v = window.sessionStorage.getItem(sortKey);
    const allowed: Sort[] = ["newest", "oldest", "helpful", "official", "answered", "unanswered"];
    return (allowed as string[]).includes(v ?? "") ? (v as Sort) : "newest";
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(sortKey, sort);
  }, [sort, sortKey]);
  const [askOpenInternal, setAskOpenInternal] = useState(false);
  const askOpen = askOpenProp ?? askOpenInternal;
  const setAskOpen = useCallback((v: boolean) => {
    if (askOpenProp === undefined) setAskOpenInternal(v);
    onAskOpenChange?.(v);
  }, [askOpenProp, onAskOpenChange]);

  const [editingQuestion, setEditingQuestion] = useState<QuestionDraft | null>(null);
  const [replyOpen, setReplyOpen] = useState<{ answerId: string; questionId: string } | null>(null);
  const [answerOpen, setAnswerOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [asStore, setAsStore] = useState(true);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_product_qa", { _slug: productSlug });
    if (error) {
      console.error("[QA] load failed", error);
      setLoading(false);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const rawQs = (row?.questions ?? []) as Array<Question | null>;
    const qs: Question[] = (Array.isArray(rawQs) ? rawQs : [])
      .filter((q): q is Question => !!q && typeof q === "object" && !!q.id)
      .map((q) => ({
        ...q,
        answers: (Array.isArray(q.answers) ? q.answers : [])
          .filter((a): a is Answer => !!a && typeof a === "object" && !!a.id),
      }));
    const votes = (row?.my_answer_votes ?? []) as string[];
    setItems(qs);
    setVoted(new Set(Array.isArray(votes) ? votes : []));
    setLoading(false);
  }, [productSlug]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading) onCountChange?.(items.length);
  }, [items.length, loading, onCountChange]);


  // Deep-link: after items render, scroll the target question into view.
  const scrolledForHash = useRef<string | null>(null);
  useEffect(() => {
    if (loading || items.length === 0 || typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.startsWith("#q-") || scrolledForHash.current === hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) {
      scrolledForHash.current = hash;
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [loading, items]);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "manager", "support"])
      .then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));
  }, [user]);

  // Realtime: refresh on any change to questions/answers for this slug
  useEffect(() => {
    const ch = supabase
      .channel(`qa-${productSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_questions", filter: `product_slug=eq.${productSlug}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "product_answers" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [productSlug, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items;
    if (q) {
      list = list.filter((it) =>
        it.question.toLowerCase().includes(q) ||
        (it.details ?? "").toLowerCase().includes(q) ||
        it.answers.some((a) => a.body.toLowerCase().includes(q)),
      );
    }
    if (sort === "answered") list = list.filter((it) => it.answers.length > 0);
    if (sort === "unanswered") list = list.filter((it) => it.answers.length === 0);
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    else if (sort === "oldest") sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    else if (sort === "helpful") sorted.sort((a, b) => {
      const av = a.answers.reduce((s, x) => s + x.helpful_count, 0);
      const bv = b.answers.reduce((s, x) => s + x.helpful_count, 0);
      return bv - av;
    });
    else if (sort === "official") sorted.sort((a, b) => {
      const ao = a.answers.some((x) => x.is_official || x.is_store_response) ? 1 : 0;
      const bo = b.answers.some((x) => x.is_official || x.is_store_response) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
    return sorted;
  }, [items, search, sort]);

  const answered = items.filter((q) => q.answers.length > 0).length;

  async function postAnswer(questionId: string, parentAnswerId: string | null) {
    const text = draft.trim();
    if (!text) return;
    if (!user) { toast.message("Sign in to answer."); return; }
    if (!isAdmin) { toast.error("Only administrators can answer questions."); return; }
    try {
      const { error } = await supabase.from("product_answers").insert({
        question_id: questionId,
        parent_answer_id: parentAnswerId,
        user_id: user.id,
        body: text,
        is_store_response: asStore && !parentAnswerId,
      });
      if (error) throw error;
      setDraft("");
      setAnswerOpen(null);
      setReplyOpen(null);
      toast.success("Answer posted");
      void load();
    } catch (err) {
      console.error("[QA] answer failed", err);
      toast.error(friendlyError(err, "Couldn't post your answer."));
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return;
    try {
      const { error } = await supabase.from("product_answers").update({ body }).eq("id", editing.id);
      if (error) throw error;
      setEditing(null);
      void load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update answer."));
    }
  }

  async function deleteAnswer(id: string) {
    if (!isAdmin) { toast.error("Only administrators can delete answers."); return; }
    if (!confirm("Delete this answer? This cannot be undone.")) return;
    try {
      const { error } = await supabase.from("product_answers").delete().eq("id", id);
      if (error) throw error;
      toast.success("Answer deleted");
      void load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't delete."));
    }
  }

  async function hideAnswer(id: string) {
    try {
      const { error } = await supabase.from("product_answers").update({ status: "hidden" }).eq("id", id);
      if (error) throw error;
      void load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't hide."));
    }
  }

  async function toggleVote(id: string) {
    if (!user) { toast.message("Sign in to vote."); return; }
    // optimistic
    setVoted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setItems((prev) => prev.map((q) => ({
      ...q,
      answers: q.answers.map((a) => a.id === id ? { ...a, helpful_count: a.helpful_count + (voted.has(id) ? -1 : 1) } : a),
    })));
    const { error } = await supabase.rpc("toggle_answer_helpful", { _answer_id: id });
    if (error) { toast.error("Vote failed"); void load(); }
  }

  async function markOfficial(questionId: string, answerId: string, currentlyOfficial: boolean) {
    if (!isAdmin) { toast.error("Only administrators can mark official answers."); return; }
    try {
      const { error } = await supabase.rpc("mark_official_answer", {
        _question_id: questionId,
        _answer_id: (currentlyOfficial ? null : answerId) as string,
      });
      if (error) throw error;
      toast.success(currentlyOfficial ? "Unpinned" : "Marked as official");
      void load();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't update official answer."));
    }
  }

  async function deleteQuestion(q: Question) {
    if (!(q.is_mine || isAdmin)) {
      toast.error("You can only delete your own question.");
      return;
    }
    if (!confirm("Delete this question? This cannot be undone.")) return;
    try {
      const { error } = await supabase
        .from("product_questions")
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", q.id);
      if (error) throw error;
      toast.success("Question deleted");
      // Remove locally so scroll position stays put; realtime will confirm.
      setItems((prev) => prev.filter((x) => x.id !== q.id));
    } catch (err) {
      toast.error(friendlyError(err, q.is_mine ? "You can only delete your own question." : "Couldn't delete question."));
    }
  }

  async function hideQuestion(q: Question) {
    if (!isAdmin) return;
    try {
      const { error } = await supabase.from("product_questions").update({ status: "hidden" }).eq("id", q.id);
      if (error) throw error;
      toast.success("Question hidden");
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't hide question."));
    }
  }

  function startEditQuestion(q: Question) {
    if (!(q.is_mine || isAdmin)) {
      toast.error("You can only edit your own question.");
      return;
    }
    setEditingQuestion({
      id: q.id,
      question: q.question,
      details: q.details ?? "",
      is_anonymous: q.is_anonymous,
    });
  }

  const askButton = (fullWidth = false) => (
    <button
      onClick={() => setAskOpen(true)}
      className={`inline-flex items-center justify-center h-12 rounded-[15px] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(234,88,12,0.55)] bg-gradient-to-b from-[hsl(28_95%_58%)] to-[hsl(20_90%_48%)] hover:brightness-[1.06] active:scale-[0.98] transition-all duration-200 ${fullWidth ? "w-full sm:w-auto" : ""}`}
    >
      Ask a Question
    </button>
  );

  return (
    <section className="max-w-7xl mx-auto pt-2 pb-16">
      {/* Header */}
      {!hideHeader && (
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[22px] sm:text-[26px] font-display font-semibold tracking-tight text-foreground">
              Questions &amp; Answers
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
              Ask questions and get answers from shoppers and our team.
            </p>
            {items.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  <span className="text-foreground font-semibold">{items.length}</span> {items.length === 1 ? "Question" : "Questions"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-3 py-1 text-[11px] font-medium text-emerald-300">
                  <span className="font-semibold">{answered}</span> Answered
                </span>
              </div>
            )}
          </div>
          {!hideAskCta && <div className="shrink-0">{askButton(true)}</div>}
        </div>
      )}

      {/* Controls */}
      {items.length > 0 && (
        <div className={`${hideHeader ? "" : "sticky top-16 z-20"} -mx-4 sm:mx-0 mb-5 px-4 sm:px-0 py-2 ${hideHeader ? "" : "bg-background/85 backdrop-blur-xl"}`}>
          <div className="flex gap-2 flex-wrap">
            {externalSearch === undefined && (
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search questions and answers…"
                  className="w-full h-11 bg-card border border-border rounded-full pl-11 pr-4 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10 transition"
                />
              </div>
            )}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-11 bg-card border border-border rounded-full px-4 pr-9 text-sm font-medium focus:outline-none focus:border-accent/60 transition cursor-pointer"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="helpful">Most Helpful</option>
              <option value="official">Official Answers First</option>
              <option value="answered">Most Answered</option>
              <option value="unanswered">Unanswered</option>
            </select>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        hideEmptyState ? null : (
          <div className="py-16 px-6 text-center rounded-[20px] border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
            <div className="mx-auto mb-5 size-16 rounded-2xl grid place-items-center bg-accent/10 border border-accent/20 text-accent">
              <MessageCircleQuestion className="size-7" strokeWidth={1.5} />
            </div>
            <p className="text-lg font-display font-semibold mb-1.5">No questions yet</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed mb-6">Be the first to ask about this product.</p>
            {!hideAskCta && <div className="max-w-xs mx-auto">{askButton(true)}</div>}
          </div>
        )
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No questions match your filters.</p>

      ) : (
        <ul className="space-y-3">
          {filtered.slice(0, visible).map((q) => {
            const asker = q.author_name || "Customer";
            const roots = q.answers.filter((a) => !a.parent_answer_id);
            const repliesOf = (aid: string) => q.answers.filter((a) => a.parent_answer_id === aid);
            const officialExists = q.answers.some((a) => a.is_official || a.is_store_response);
            const count = q.answers.length;

            let statusPill: React.ReactNode;
            if (officialExists || count > 0) {
              statusPill = (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/[0.12] text-accent px-2.5 py-1 text-[11px] font-medium">
                  <span className="size-1.5 rounded-full bg-accent" /> Officially Answered
                </span>
              );
            } else {
              statusPill = (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/[0.12] text-amber-300 px-2.5 py-1 text-[11px] font-medium">
                  <span className="size-1.5 rounded-full bg-amber-400" /> Awaiting Response
                </span>
              );
            }

            return (
              <li
                key={q.id}
                id={`q-${q.id}`}
                className="bg-card/60 border border-border rounded-[18px] p-4 sm:p-5 animate-fade-in transition-colors hover:border-white/15 scroll-mt-24 target:border-accent/40"
              >
                {/* Header row: avatar + name + time + menu */}
                <div className="flex items-start gap-3">
                  <Avatar name={asker} url={q.author_avatar} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-muted-foreground truncate">
                      Asked by <span className="font-display font-semibold text-foreground">{asker}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">Asked {relDate(q.created_at)}</p>

                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const url = `${window.location.origin}${window.location.pathname}#q-${q.id}`;
                      try {
                        if (navigator.share) await navigator.share({ url, title: q.question });
                        else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
                      } catch { /* user cancelled */ }
                    }}
                    aria-label="Share question"
                    className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
                  >
                    <Link2 className="size-4" />
                  </button>
                  <QuestionMenu
                    isAdmin={isAdmin}
                    isMine={q.is_mine}
                    onEdit={() => startEditQuestion(q)}
                    onDelete={() => deleteQuestion(q)}
                    onReply={isAdmin ? () => { setAnswerOpen(q.id); setDraft(""); } : undefined}
                    onHide={isAdmin ? () => hideQuestion(q) : undefined}
                  />
                </div>

                {/* Question body */}
                <p className="mt-3 text-[17px] sm:text-[18px] font-semibold leading-snug text-foreground break-words line-clamp-3 hover:line-clamp-none transition-all">
                  {q.question}
                </p>
                {q.details && (
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">{q.details}</p>
                )}

                {/* Meta row */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {statusPill}
                  <span className="text-xs text-muted-foreground font-medium">
                    {count} {count === 1 ? "Answer" : "Answers"}
                  </span>
                </div>

                {/* Answers */}
                {roots.length > 0 && (
                  <div className="mt-4 space-y-2.5">
                    {[...roots].sort((a, b) => Number(b.is_official) - Number(a.is_official)).map((a) => (
                      <div key={a.id} className="space-y-2">
                        {editing?.id === a.id ? (
                          <div className="rounded-[14px] p-3.5 border border-border bg-background/40">
                            <textarea
                              value={editing.body}
                              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                              rows={3}
                              className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
                            />
                            <div className="flex gap-2 mt-2">
                              <button onClick={saveEdit} className="bg-accent text-accent-foreground font-bold px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition">Save</button>
                              <button onClick={() => setEditing(null)} className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <AnswerRow
                            answer={a}
                            isAdmin={isAdmin}
                            voted={voted.has(a.id)}
                            onVote={() => toggleVote(a.id)}
                            onDelete={() => deleteAnswer(a.id)}
                            onEdit={() => setEditing({ id: a.id, body: a.body })}
                            onMarkOfficial={() => markOfficial(q.id, a.id, a.is_official)}
                            onReply={isAdmin ? () => { setReplyOpen({ answerId: a.id, questionId: q.id }); setDraft(""); } : undefined}
                            onHide={() => hideAnswer(a.id)}
                          />
                        )}
                        {repliesOf(a.id).map((r) => (
                          <AnswerRow
                            key={r.id}
                            answer={r}
                            isAdmin={isAdmin}
                            isReply
                            voted={voted.has(r.id)}
                            onVote={() => toggleVote(r.id)}
                            onDelete={() => deleteAnswer(r.id)}
                            onEdit={() => setEditing({ id: r.id, body: r.body })}
                            onHide={() => hideAnswer(r.id)}
                          />
                        ))}
                        {isAdmin && replyOpen?.answerId === a.id && (
                          <div className="ml-8 flex gap-2">
                            <input
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Write a reply…"
                              className="flex-1 bg-background border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:border-accent"
                            />
                            <button onClick={() => postAnswer(q.id, a.id)} disabled={!draft.trim()} className="bg-accent text-accent-foreground font-bold px-4 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition disabled:opacity-50">Reply</button>
                            <button onClick={() => { setReplyOpen(null); setDraft(""); }} className="px-3 rounded-full text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition">Cancel</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Answer composer — ADMIN ONLY. Customers cannot answer questions. */}
                {isAdmin && (
                  answerOpen === q.id ? (
                    <div className="mt-3">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={2}
                        placeholder="Write an answer…"
                        className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
                      />
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <label className="inline-flex items-center gap-2 text-[11px] font-mono text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={asStore} onChange={(e) => setAsStore(e.target.checked)} className="size-3.5 accent-accent" />
                          Post as Store Response
                        </label>
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => { setAnswerOpen(null); setDraft(""); }} className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition">Cancel</button>
                          <button onClick={() => postAnswer(q.id, null)} disabled={!draft.trim()} className="bg-accent text-accent-foreground font-bold px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition disabled:opacity-50">Post answer</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setAnswerOpen(q.id); setDraft(""); }} className="mt-3 text-[11px] font-mono uppercase tracking-widest text-accent hover:brightness-110 transition">
                      + Add answer
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > visible && (
        <div className="mt-6 grid place-items-center">
          <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="text-[11px] font-mono uppercase tracking-widest border border-border rounded-full px-5 py-2.5 hover:border-accent hover:text-accent transition">
            Load more questions
          </button>
        </div>
      )}


      <QuestionModal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        productSlug={productSlug}
        initial={null}
        onSubmitted={load}
      />
      <QuestionModal
        open={!!editingQuestion}
        onClose={() => setEditingQuestion(null)}
        productSlug={productSlug}
        initial={editingQuestion}
        onSubmitted={load}
      />
    </section>
  );
}
