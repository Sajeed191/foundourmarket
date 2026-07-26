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
  
} from "lucide-react";
import { toast } from "sonner";
import { useModalScrollLock } from "@/lib/use-scroll-lock";
import { useImmersiveChrome } from "@/lib/use-immersive-chrome";

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
  onOptimisticInsert,
  onViewQuestion,
  questionSuggestions = [],
  onQuestionSuggestionSelect,
}: {
  open: boolean;
  onClose: () => void;
  productSlug: string;
  initial: QuestionDraft | null;
  onSubmitted: () => void;
  /** v6.7 — inserts an optimistic pending question into the list immediately. */
  onOptimisticInsert?: (q: Question) => void;
  /** v6.7 — deep-links to the newly submitted question. */
  onViewQuestion?: (id: string) => void;
  faqSuggestions?: ProductFaq[];
  questionSuggestions?: Question[];
  onFaqSuggestionSelect?: (id: string) => void;
  onQuestionSuggestionSelect?: (id: string) => void;
}) {

  const { user } = useAuth();
  const navigate = useNavigate();
  const isEdit = !!initial?.id;
  const [question, setQuestion] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState<{ q: string; anon: boolean }>({ q: "", anon: false });
  const [dupeMatch, setDupeMatch] = useState<Question | null>(null);
  const [confirmedDupe, setConfirmedDupe] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  // PDP v7.0 — unsaved question protection.
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const submittingRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const continueBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setMounted(false);
      setDupeMatch(null);
      setConfirmedDupe(false);
      setErrorMsg(null);
      setSuccessId(null);
      setShowDiscardConfirm(false);
      submittingRef.current = false;
      return;
    }
    const q = initial?.question ?? "";
    const a = initial?.is_anonymous ?? false;
    setQuestion(q);
    setAnon(a);
    setInitialSnapshot({ q, anon: a });
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [open, initial]);

  // Auto-grow the textarea from a compact 5–6 line start up to ~40% of the
  // viewport height; beyond that the textarea itself scrolls internally so the
  // modal never stretches into a giant empty canvas.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      const vh = typeof window !== "undefined" ? window.innerHeight : 800;
      const cap = Math.round(vh * 0.4);
      const next = Math.min(cap, Math.max(132, el.scrollHeight));
      el.style.height = next + "px";
      el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
    };
    resize();
    if (typeof window === "undefined") return;
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [question, open, successId]);


  // Clear the duplicate hint and error whenever the user edits the question.
  useEffect(() => {
    setDupeMatch(null);
    setConfirmedDupe(false);
    setErrorMsg(null);
  }, [question]);

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

  // PDP v7.0 — a draft is "dirty" whenever the user has typed something not
  // yet submitted. Success and busy states never guard.
  const isDirty = open && !successId && !busy && changed;
  const dirtyRef = useRef(false);
  dirtyRef.current = isDirty;
  const successRef = useRef<string | null>(null);
  successRef.current = successId;
  const busyRef = useRef(false);
  busyRef.current = busy;

  // Stable close-intent that respects the dirty guard. Passed to the shell
  // (backdrop + ESC) and history handlers so the reference never changes and
  // the scroll-lock effect doesn't re-run.
  const closeIntentRef = useRef<() => void>(() => {});
  closeIntentRef.current = () => {
    if (successRef.current) { onClose(); return; }
    if (busyRef.current) return;
    if (dirtyRef.current) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };
  const requestClose = useCallback(() => closeIntentRef.current(), []);

  // Android back-button: push a sentinel state on open, intercept popstate.
  useEffect(() => {
    if (!open) return;
    const marker = { __qaModal: true, ts: Date.now() };
    try { window.history.pushState(marker, ""); } catch { /* noop */ }
    const onPop = () => {
      // Re-arm the sentinel so a "Continue Editing" choice keeps the guard.
      try { window.history.pushState({ __qaModal: true }, ""); } catch { /* noop */ }
      closeIntentRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Best-effort: unwind the sentinel if it's still on top.
      if ((window.history.state as { __qaModal?: boolean } | null)?.__qaModal) {
        try { window.history.back(); } catch { /* noop */ }
      }
    };
  }, [open]);

  if (!open) return null;


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

    // v6.6 — silent duplicate check on submit.
    if (!isEdit && !confirmedDupe) {
      const best = questionSuggestions
        .map((q) => ({ q, s: scoreOverlap(text, q.question) }))
        .filter((x) => x.s >= 0.6 && x.q.answers.length > 0)
        .sort((a, b) => b.s - a.s)[0];
      if (best) {
        setDupeMatch(best.q);
        setConfirmedDupe(true);
        return;
      }
    }

    submittingRef.current = true;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (isEdit && initial?.id) {
        const { error } = await supabase
          .from("product_questions")
          .update({ question: text, is_anonymous: false })
          .eq("id", initial.id);
        if (error) throw error;
        toast.success("Question updated successfully.");
        onSubmitted();
        onClose();
      } else {
        const { data, error } = await supabase
          .from("product_questions")
          .insert({
            product_slug: productSlug,
            user_id: user.id,
            question: text,
            details: null,
            is_anonymous: false,
          })
          .select("id, created_at")
          .single();
        if (error) throw error;

        // v6.7 — optimistically insert as a pending question so it appears
        // in the list immediately with an "Awaiting Response" status.
        const newId = (data?.id as string) ?? `pending-${Date.now()}`;
        const createdAt = (data?.created_at as string) ?? new Date().toISOString();
        const meta = (user.user_metadata ?? {}) as {
          full_name?: string;
          name?: string;
          avatar_url?: string;
        };
        const displayName =
          meta.full_name || meta.name || user.email?.split("@")[0] || "You";
        const avatarUrl = meta.avatar_url ?? null;

        onOptimisticInsert?.({
          id: newId,
          product_slug: productSlug,
          question: text,
          details: null,
          is_anonymous: false,
          status: "pending",
          helpful_count: 0,
          created_at: createdAt,
          is_mine: true,
          author_name: displayName,
          author_avatar: avatarUrl,
          answers: [],
        });
        onSubmitted();
        setSuccessId(newId);
      }
    } catch (err) {
      console.error("[QA] submit failed", err);
      setErrorMsg(
        friendlyError(err, "We couldn't submit your question. Please try again."),
      );
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <QuestionModalShell open={open} mounted={mounted} onClose={requestClose}>
      {successId ? (
        <div className="flex flex-col h-full">
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
          </div>
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-2 min-h-0 flex flex-col items-center text-center">
            <div
              className="grid place-items-center rounded-full"
              style={{
                width: 68,
                height: 68,
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.28)",
                boxShadow: "0 10px 30px -18px rgba(16,185,129,0.45)",
              }}
            >
              <CheckCircle2 className="size-8 text-emerald-400" strokeWidth={1.8} />
            </div>
            <h3 className="mt-5 text-[20px] font-display font-semibold text-foreground leading-tight">
              Question Submitted
            </h3>
            <p className="mt-2 text-[14px] text-muted-foreground leading-relaxed max-w-[380px]">
              Thank you! Your question has been sent to the FoundOurMarket™ team.
              We&apos;ll review it and publish an official answer as soon as possible.
            </p>
          </div>
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
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                onViewQuestion?.(successId);
                onClose();
              }}
              className="inline-flex items-center justify-center gap-2 px-6 text-[14px] font-semibold transition"
              style={{
                height: 46,
                minWidth: 152,
                borderRadius: 16,
                color: "#050608",
                background: "linear-gradient(135deg,#ff9f43 0%, #ff8a2a 55%, #f07d00 100%)",
                boxShadow: "0 10px 26px -16px rgba(255,138,42,0.55)",
              }}
            >
              View My Question
            </button>
          </div>
        </div>
      ) : (
      <form onSubmit={submit} className="flex flex-col h-full animate-fade-in">
        {/* Header */}
        <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
          <button
            type="button"
            onClick={requestClose}
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
              : "What would you like to know about this product?"}
          </p>
        </div>

        {/* Body — compact top-aligned block; textarea auto-grows up to 40vh. */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-2 min-h-0">
          <div className="relative">
            <textarea
              ref={taRef}
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={500}
              placeholder="Ask about product features, size, compatibility, warranty, delivery, or anything else…"
              aria-label={isEdit ? "Edit your question" : "Your question"}
              aria-invalid={!!validationMsg}
              className="w-full text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none transition-[border-color,box-shadow] duration-200"
              style={{
                minHeight: 132,
                background: "#0E1116",
                border: `1px solid ${validationMsg ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 18,
                padding: 16,
                fontSize: 16,
                lineHeight: 1.6,
              }}
              onFocus={(e) => {
                if (!validationMsg) {
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                  e.currentTarget.style.boxShadow = "0 0 0 4px rgba(255,138,42,0.10)";
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = validationMsg
                  ? "rgba(239,68,68,0.45)"
                  : "rgba(255,255,255,0.08)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] tabular-nums">
            <span className={validationMsg ? "text-[#f97a7a]" : "text-muted-foreground/70"}>
              {validationMsg}
            </span>
            <span
              className={
                question.length >= 500
                  ? "text-[#f97a7a]"
                  : question.length > 400
                    ? "text-accent"
                    : "text-muted-foreground/70"
              }
            >
              {question.length} / 500
            </span>
          </div>

          {/* Subtle helper text — sets expectations without cluttering the field. */}
          <ul className="mt-3 space-y-1 text-[12px] leading-relaxed text-muted-foreground/70">
            <li>• FoundOurMarket™ will respond as soon as possible.</li>
            <li>• Do not include personal information.</li>
            <li>• Keep your question product-related.</li>
          </ul>

          {/* v6.6 — single inline duplicate hint. */}
          {dupeMatch && !isEdit && (
            <div className="mt-3 rounded-2xl border border-accent/20 bg-accent/[0.05] px-4 py-3 flex items-start gap-3">
              <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="text-[13px] leading-snug text-foreground flex-1">
                A similar question has already been answered.{" "}
                <button
                  type="button"
                  onClick={() => { onQuestionSuggestionSelect?.(dupeMatch.id); onClose(); }}
                  className="font-semibold text-accent hover:underline underline-offset-2"
                >
                  View Answer
                </button>
              </p>
            </div>
          )}

          {/* v6.7 — inline submission error; typed content is preserved. */}
          {errorMsg && (
            <div
              className="mt-3 rounded-2xl px-4 py-3 text-[13px] leading-snug"
              style={{
                border: "1px solid rgba(239,68,68,0.28)",
                background: "rgba(239,68,68,0.06)",
                color: "#fca5a5",
              }}
              role="alert"
            >
              {errorMsg}
            </div>
          )}
        </div>


        {/* Sticky footer — pinned above the safe area on all devices. */}
        <div
          className="px-5 sm:px-6 pt-4 pb-5 flex items-center justify-end gap-3"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex items-center justify-center px-5 rounded-2xl text-[14px] font-medium text-foreground/85 hover:text-foreground transition-colors"
            style={{ height: 46, minWidth: 96, border: "1px solid rgba(255,255,255,0.10)", background: "transparent" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label={isEdit ? "Save changes" : "Submit question"}
            aria-busy={busy}
            className="inline-flex items-center justify-center gap-2 px-6 text-[14px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100"
            style={{
              height: 46,
              minWidth: 152,
              borderRadius: 16,
              color: canSubmit || busy ? "#050608" : "rgba(255,255,255,0.55)",
              background: canSubmit || busy
                ? "linear-gradient(135deg,#ff9f43 0%, #ff8a2a 55%, #f07d00 100%)"
                : "rgba(255,255,255,0.08)",
              boxShadow: canSubmit || busy ? "0 10px 26px -16px rgba(255,138,42,0.55)" : "none",
              opacity: busy ? 0.85 : 1,
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
            {busy ? "Submitting…" : isEdit ? "Save Changes" : user ? "Submit Question" : "Sign in to submit"}
          </button>
        </div>
      </form>

      )}
      {showDiscardConfirm && (
        <DiscardDraftConfirm
          continueRef={continueBtnRef}
          onContinue={() => {
            setShowDiscardConfirm(false);
            // Restore focus + cursor to the textarea where the user left it.
            requestAnimationFrame(() => {
              const el = taRef.current;
              if (el) {
                const pos = el.value.length;
                el.focus();
                try { el.setSelectionRange(pos, pos); } catch { /* noop */ }
              }
            });
          }}
          onDiscard={() => {
            setShowDiscardConfirm(false);
            setQuestion("");
            onClose();
          }}
        />
      )}
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
  // PDP v6.9 — Full-screen Ask a Question experience.
  // - Lock background scroll and preserve scroll position.
  // - Hide every floating chrome element via body[data-qa-modal-open] (CSS).
  // - Hide LiveChat/admin widgets that subscribe to the floating-stack context.
  // Scroll lock + instant, jump-free restore lives in the shared hook.
  useModalScrollLock(open, "data-qa-modal-open");
  useImmersiveChrome(open);

  useEffect(() => {
    if (!open) return;

    let restoreContext = () => {};
    // Best-effort: hide LiveChat / admin floating widgets that opt into the
    // shared floating-stack context. Loaded dynamically to avoid a hard dep.
    import("@/lib/floating-stack")
      .then((m) => {
        m.setContextHidden(true);
        restoreContext = () => m.setContextHidden(false);
      })
      .catch(() => {});

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      restoreContext();
    };
  }, [open, onClose]);


  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fom-overlay fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        opacity: mounted ? 1 : 0,
        transition: "opacity 260ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fom-surface w-[92vw] max-w-[520px] max-h-[85dvh] flex flex-col overflow-hidden"
        style={{
          animation: "none",
          transform: mounted ? "scale(1)" : "scale(0.96)",
          opacity: mounted ? 1 : 0,
          transition: "transform 260ms cubic-bezier(0.22,1,0.36,1), opacity 260ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}


/* PDP v7.0 — confirmation shown when the customer attempts to dismiss the
   Ask a Question modal with unsaved text. Layers above the modal shell,
   traps focus on the primary "Continue Editing" action, and closes on
   Escape (equivalent to Continue Editing). */
function DiscardDraftConfirm({
  continueRef,
  onContinue,
  onDiscard,
}: {
  continueRef: React.RefObject<HTMLButtonElement | null>;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Autofocus the safe primary action.
    requestAnimationFrame(() => continueRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onContinue();
        return;
      }
      if (e.key === "Tab") {
        // Simple focus trap between the two buttons.
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>("button:not([disabled])"),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Capture phase so we win over the shell's own Escape → onClose handler.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [continueRef, onContinue]);

  return (
    <div
      className="fom-overlay fixed inset-0 z-[90] grid place-items-center p-5"
      onClick={onContinue}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="qa-discard-title"
        aria-describedby="qa-discard-desc"
        onClick={(e) => e.stopPropagation()}
        className="fom-surface w-full max-w-[400px] p-6"
      >
        <h3 id="qa-discard-title" className="text-[17px] font-display font-semibold text-foreground leading-tight">
          Discard your question?
        </h3>
        <p id="qa-discard-desc" className="mt-2 text-[13.5px] text-muted-foreground leading-relaxed">
          Your question hasn&apos;t been submitted yet. If you leave now, your draft will be lost.
        </p>
        <div className="mt-5 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex items-center justify-center h-11 px-5 rounded-2xl text-[13.5px] font-medium transition-colors"
            style={{
              color: "#fca5a5",
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.28)",
            }}
          >
            Discard
          </button>
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="inline-flex items-center justify-center h-11 px-5 text-[13.5px] font-semibold transition"
            style={{
              borderRadius: 16,
              color: "#050608",
              background: "linear-gradient(135deg,#ff9f43 0%, #ff8a2a 55%, #f07d00 100%)",
              boxShadow: "0 10px 26px -16px rgba(255,138,42,0.55)",
            }}
          >
            Continue Editing
          </button>
        </div>
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
          <CollapsibleAnswerBody body={answer.body} />

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

/* v6.8 — CollapsibleAnswerBody: collapse long official/team answers past
   ~6 lines with a smooth Read more / Show less toggle. Short answers stay
   fully visible. Pure presentation — no data or realtime side effects. */
const COLLAPSED_MAX_PX = 132; // ~6 lines at 14px / leading-relaxed
function CollapsibleAnswerBody({ body }: { body: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.scrollHeight;
      setNaturalHeight(h);
      setOverflow(h - 2 > COLLAPSED_MAX_PX);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [body]);

  const maxHeight = !overflow
    ? "none"
    : expanded
      ? `${naturalHeight ?? 9999}px`
      : `${COLLAPSED_MAX_PX}px`;

  return (
    <div className="mt-1.5">
      <div
        className="relative overflow-hidden transition-[max-height] duration-400 ease-out"
        style={{ maxHeight }}
      >
        <p
          ref={ref}
          className="text-sm leading-relaxed break-words whitespace-pre-wrap"
        >
          {body}
        </p>
        {overflow && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/90 to-transparent"
          />
        )}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[12px] font-mono uppercase tracking-[0.18em] text-accent hover:text-accent/80 transition"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

/* v6.7 — AnswerReveal: smooth no-layout-pop expansion for realtime-arriving
   answers. Uses grid-template-rows 0fr→1fr + opacity/translateY so the
   surrounding page grows fluidly instead of snapping. Answers already
   present on initial load render fully expanded (no animation). */
function AnswerReveal({ animate, children }: { animate: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, [animate]);
  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-500 ease-out"
      style={{
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-6px)",
      }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
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
  faqs = [],
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
  /** v6.3 — Product FAQs, used inside the Ask modal for auto-link suggestions. */
  faqs?: ProductFaq[];
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

  const [confirmDeleteQ, setConfirmDeleteQ] = useState<Question | null>(null);
  const [deletingQ, setDeletingQ] = useState(false);
  const [deleteQError, setDeleteQError] = useState<string | null>(null);

  // Q&A v7.3 — immersive mode while answering / editing an answer or reply, so
  // the composer reads as its own premium screen.
  useImmersiveChrome(!!answerOpen || !!editing || !!replyOpen || !!confirmDeleteQ);

  // v6.7 — Track answer IDs present at initial load so ONLY realtime-arrived
  // answers get the smooth reveal animation.
  const seenAnswerIdsRef = useRef<Set<string> | null>(null);
  const isNewAnswer = useCallback((id: string) => {
    const seen = seenAnswerIdsRef.current;
    return !!seen && !seen.has(id);
  }, []);

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
    // Seed seen-answer set on first successful load; keep it stable afterwards
    // so incoming realtime answers are correctly detected as "new".
    if (seenAnswerIdsRef.current === null) {
      const seen = new Set<string>();
      for (const q of qs) for (const a of q.answers) seen.add(a.id);
      seenAnswerIdsRef.current = seen;
    } else {
      // Fold any freshly-seen IDs in *after* one paint so they still animate
      // this cycle, but subsequent re-renders treat them as seen.
      requestAnimationFrame(() => {
        const seen = seenAnswerIdsRef.current;
        if (!seen) return;
        for (const q of qs) for (const a of q.answers) seen.add(a.id);
      });
    }
    setLoading(false);
  }, [productSlug]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading) onCountChange?.(items.length);
  }, [items.length, loading, onCountChange]);


  // Deep-link only: scroll to the hash target once, using the hash captured on
  // mount. Later renders (optimistic inserts, realtime refreshes, edits,
  // deletes) never move the page.
  const initialHashRef = useRef<string | null>(null);
  const scrolledForHash = useRef<string | null>(null);
  if (initialHashRef.current === null && typeof window !== "undefined") {
    initialHashRef.current = window.location.hash || "";
  }
  useEffect(() => {
    if (loading || items.length === 0 || typeof window === "undefined") return;
    const hash = initialHashRef.current ?? "";
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

  function deleteQuestion(q: Question) {
    if (!(q.is_mine || isAdmin)) {
      toast.error("You can only delete your own question.");
      return;
    }
    // v7.3 — premium confirmation surface instead of the native confirm().
    setDeleteQError(null);
    setConfirmDeleteQ(q);
  }

  async function performDeleteQuestion() {
    const q = confirmDeleteQ;
    if (!q || deletingQ) return; // double-submission guard
    setDeletingQ(true);
    setDeleteQError(null);
    const prevItems = items;
    setItems((prev) => prev.filter((x) => x.id !== q.id));
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("You appear to be offline. Check your connection and try again.");
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) throw new Error("Your session expired. Please sign in again.");
      const { error } = await supabase
        .from("product_questions")
        .delete()
        .eq("id", q.id);
      if (error) throw error;
      toast.success("Question deleted");
      setConfirmDeleteQ(null);
    } catch (err) {
      console.error("[qa] delete question failed", { questionId: q.id, err });
      setItems(prevItems);
      setDeleteQError(friendlyError(err, q.is_mine ? "You can only delete your own question." : "Couldn't delete question."));
    } finally {
      setDeletingQ(false);
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
                {/* Header row: avatar + name + time + menu (v6.4 — no "Asked by" prefix) */}
                <div className="flex items-start gap-3">
                  <Avatar name={asker} url={q.author_avatar} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-display font-semibold text-foreground truncate">{asker}</p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5">{relDate(q.created_at)}</p>
                  </div>
                  {/* v7.x — Share link removed per design; menu remains for owner/admin actions. */}

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

                {/* Status pill — only Awaiting Response is shown here; the official
                    answer card below carries its own "FoundOurMarket™ Official" identity. */}
                {!officialExists && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {statusPill}
                  </div>
                )}



                {/* Answers */}
                {roots.length > 0 && (
                  <div className="mt-4 space-y-2.5">
                    {[...roots].sort((a, b) => Number(b.is_official) - Number(a.is_official)).map((a) => (
                      <div key={a.id} className="space-y-2">
                        {editing?.id === a.id ? (
                          <div className="rounded-[14px] p-3.5 border border-white/[0.07] bg-white/[0.04]">
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
                          <AnswerReveal animate={isNewAnswer(a.id)}>
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
                          </AnswerReveal>
                        )}
                        {repliesOf(a.id).map((r) => (
                          <AnswerReveal key={r.id} animate={isNewAnswer(r.id)}>
                            <AnswerRow
                              answer={r}
                              isAdmin={isAdmin}
                              isReply
                              voted={voted.has(r.id)}
                              onVote={() => toggleVote(r.id)}
                              onDelete={() => deleteAnswer(r.id)}
                              onEdit={() => setEditing({ id: r.id, body: r.body })}
                              onHide={() => hideAnswer(r.id)}
                            />
                          </AnswerReveal>
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
        onOptimisticInsert={(q) => {
          setItems((prev) => (prev.some((x) => x.id === q.id) ? prev : [q, ...prev]));
        }}
        onViewQuestion={(id) => {
          if (typeof window === "undefined") return;
          const scrollTo = () => {
            const el = document.getElementById(`q-${id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            else window.location.hash = `#q-${id}`;
          };
          requestAnimationFrame(() => requestAnimationFrame(scrollTo));
        }}
        faqSuggestions={faqs}
        questionSuggestions={items}
        onFaqSuggestionSelect={(id) => {
          if (typeof window === "undefined") return;
          const el = document.getElementById(`faq-${id}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.location.hash = `#faq-${id}`;
        }}
        onQuestionSuggestionSelect={(id) => {
          if (typeof window === "undefined") return;
          const el = document.getElementById(`q-${id}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.location.hash = `#q-${id}`;
        }}
      />


      <QuestionModal
        open={!!editingQuestion}
        onClose={() => setEditingQuestion(null)}
        productSlug={productSlug}
        initial={editingQuestion}
        onSubmitted={load}
      />
      {/* Q&A v7.3 — premium delete-question confirmation */}
      {confirmDeleteQ && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Delete question"
          className="fom-overlay fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={() => { if (!deletingQ) setConfirmDeleteQ(null); }}
          onTouchMove={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fom-surface w-[92vw] max-w-[20rem] px-7 py-8 text-center"
          >
            <div className="mx-auto grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-4" />
            </div>
            <h3 className="mt-6 text-[17px] font-display leading-snug">Delete Question?</h3>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Your question and its answers will be permanently removed from this product. This action cannot be undone.
            </p>
            {deleteQError && (
              <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-[12px] leading-snug text-destructive">{deleteQError}</p>
            )}
            <div className="mt-7 flex flex-col-reverse gap-2.5">
              <button
                onClick={() => setConfirmDeleteQ(null)}
                disabled={deletingQ}
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-3 text-[11px] font-bold uppercase tracking-widest transition-all hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                Keep Question
              </button>
              <button
                onClick={performDeleteQuestion}
                disabled={deletingQ}
                aria-busy={deletingQ}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-destructive px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-destructive-foreground transition-all hover:brightness-110 disabled:opacity-60"
              >
                {deletingQ ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {deletingQ ? "Deleting…" : "Delete Question"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
