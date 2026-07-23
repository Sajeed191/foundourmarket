import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  MessageCircleQuestion,
  Loader2,
  Send,
  Search,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ThumbsUp,
  MoreHorizontal,
  X,
  Pin,
  EyeOff,
  Trash2,
  Reply,
  Pencil,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

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

type Sort = "newest" | "oldest" | "helpful" | "answered" | "unanswered";

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
}: {
  open: boolean;
  onClose: () => void;
  productSlug: string;
  initial: QuestionDraft | null;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isEdit = !!initial?.id;
  const [question, setQuestion] = useState("");
  const [details, setDetails] = useState("");
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      submittingRef.current = false;
      return;
    }
    setQuestion(initial?.question ?? "");
    setDetails(initial?.details ?? "");
    setAnon(initial?.is_anonymous ?? false);
  }, [open, initial]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text) return;
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
        const { error } = await supabase
          .from("product_questions")
          .update({
            question: text,
            details: details.trim() || null,
            is_anonymous: anon,
          })
          .eq("id", initial.id);
        if (error) throw error;
        toast.success("Question updated");
      } else {
        const { error } = await supabase.from("product_questions").insert({
          product_slug: productSlug,
          user_id: user.id,
          question: text,
          details: details.trim() || null,
          is_anonymous: anon,
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
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-card border border-border rounded-[18px] shadow-2xl p-5 sm:p-6 relative"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground transition">
          <X className="size-4" />
        </button>
        <div className="mb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2">
            {isEdit ? "Edit your question" : "Ask the community"}
          </p>
          <h3 className="text-lg font-display font-semibold">
            {isEdit ? "Update your question" : "Have a question about this product?"}
          </h3>
        </div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Your question</label>
        <textarea
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Does this support fast charging?"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
        />
        <div className="flex justify-end text-[10px] font-mono text-muted-foreground mt-1">{question.length}/500</div>

        <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5 mt-2">Optional details</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Add any context that would help someone answer…"
          className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent resize-none"
        />

        <label className="mt-4 flex items-center gap-2.5 select-none cursor-pointer">
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="size-4 accent-accent" />
          <span className="text-sm text-muted-foreground">Post anonymously</span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition">Cancel</button>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {busy ? "Saving…" : isEdit ? "Save changes" : user ? "Submit" : "Sign in to submit"}
          </button>
        </div>
      </form>
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

  const name = answer.author_name || (answer.is_store_response ? "FoundOurMarket" : "Customer");
  const store = answer.is_store_response;
  const official = answer.is_official;
  // Answers are ONLY editable/deletable/moderated by admins (customers can't answer at all).
  const canManage = isAdmin;

  return (
    <div
      className={`${isReply ? "ml-8" : ""} rounded-[14px] p-3.5 border ${
        official
          ? "bg-accent/[0.06] border-accent/25"
          : store
          ? "bg-accent/[0.04] border-accent/15"
          : "bg-background/40 border-border/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={name} url={answer.author_avatar} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-display truncate">{name}</span>
            {store && (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-accent">
                <ShieldCheck className="size-2.5" /> Store
              </span>
            )}
            {official && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                <CheckCircle2 className="size-2.5" /> Official
              </span>
            )}
            <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">
              {relDate(answer.created_at)}
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

export function ProductQA({ productSlug }: { productSlug: string }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Question[]>([]);
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [askOpen, setAskOpen] = useState(false);
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

  return (
    <section className="max-w-7xl mx-auto pt-2 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Have a question? Ask the community or our team.</p>
          {items.length > 0 && (
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {items.length} question{items.length === 1 ? "" : "s"} · {answered} answered
            </p>
          )}
        </div>
        <button
          onClick={() => setAskOpen(true)}
          className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition"
        >
          <Sparkles className="size-3.5" /> Ask Question
        </button>
      </div>

      {/* Controls */}
      {items.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="w-full bg-card border border-border rounded-full pl-11 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="bg-card border border-border rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="helpful">Most Helpful</option>
            <option value="answered">Answered</option>
            <option value="unanswered">Unanswered</option>
          </select>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-14 px-6 text-center rounded-[18px] border border-white/10 bg-card/40">
          <div className="mx-auto mb-4 size-14 rounded-2xl grid place-items-center bg-accent/10 border border-accent/20 text-accent">
            <MessageCircleQuestion className="size-6" />
          </div>
          <p className="text-base font-display mb-1">No questions yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed mb-5">Be the first to ask about this product.</p>
          <button onClick={() => setAskOpen(true)} className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition">
            <Sparkles className="size-3.5" /> Ask Question
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No questions match your filters.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.slice(0, visible).map((q) => {
            const asker = q.is_anonymous ? "Anonymous" : (q.author_name || "Customer");
            const roots = q.answers.filter((a) => !a.parent_answer_id);
            const repliesOf = (aid: string) => q.answers.filter((a) => a.parent_answer_id === aid);
            const officialExists = q.answers.some((a) => a.is_official);
            return (
              <li key={q.id} className="bg-card/60 border border-border rounded-[18px] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 size-9 rounded-full bg-accent/10 text-accent border border-accent/20 grid place-items-center">
                    <MessageCircleQuestion className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-display font-semibold leading-snug">{q.question}</p>
                      {officialExists ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                          <CheckCircle2 className="size-2.5" /> Official
                        </span>
                      ) : q.answers.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Answered</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-400">
                          <Clock className="size-2.5" /> Unanswered
                        </span>
                      )}
                    </div>
                    {q.details && <p className="mt-1 text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">{q.details}</p>}
                    <p className="mt-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      Asked by {asker} · {relDate(q.created_at)} · {q.answers.length} answer{q.answers.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <QuestionMenu
                    isAdmin={isAdmin}
                    isMine={q.is_mine}
                    onEdit={() => startEditQuestion(q)}
                    onDelete={() => deleteQuestion(q)}
                    onReply={isAdmin ? () => { setAnswerOpen(q.id); setDraft(""); } : undefined}
                    onHide={isAdmin ? () => hideQuestion(q) : undefined}
                  />
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
