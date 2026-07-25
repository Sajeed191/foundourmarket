import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronDown, MessageCircleQuestion, Search } from "lucide-react";
import { fetchActiveFaqs, type ProductFaq } from "@/lib/product-faqs";
import IsolatedBoundary from "@/components/site/IsolatedBoundary";

const ProductQA = lazy(() =>
  import("@/components/site/ProductQA").then((m) => ({ default: m.ProductQA })),
);

/**
 * PDP v6.1.1 — Unified "FAQ & Questions" section (single source of heading,
 * search, empty state and Ask CTA).
 *
 * - One heading + subtitle.
 * - One search input (applied to both FAQs and community questions).
 * - One Ask a Question CTA (below the search).
 * - Single premium empty state when NO admin FAQs AND NO community questions.
 * - FAQ accordion is hidden entirely when the product has no admin FAQs.
 * - All Q&A behavior (permissions, moderation, realtime, posting) still lives
 *   inside <ProductQA />; this wrapper only owns presentation and the Ask
 *   modal open state (controlled from here so we can render a single CTA).
 */
export function PDPFaqAndQuestions({ productSlug }: { productSlug: string }) {
  const [faqs, setFaqs] = useState<ProductFaq[]>([]);
  const [faqLoading, setFaqLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFaqLoading(true);
    fetchActiveFaqs(productSlug)
      .then((rows) => {
        if (cancelled) return;
        setFaqs(rows);
        const hash = typeof window !== "undefined" ? window.location.hash : "";
        const target = hash.startsWith("#faq-") ? hash.slice(5) : null;
        const matched = target && rows.some((r) => r.id === target) ? target : null;
        setOpenId(matched ?? rows[0]?.id ?? null);
        if (matched) {
          requestAnimationFrame(() => {
            document.getElementById(`faq-${matched}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFaqs([]);
      })
      .finally(() => {
        if (!cancelled) setFaqLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  const filteredFaqs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
    );
  }, [faqs, search]);

  const hasFaqs = faqs.length > 0;
  const hasQuestions = (questionCount ?? 0) > 0;
  const isEmpty = !faqLoading && !hasFaqs && questionCount === 0;

  const AskCta = ({ full = false }: { full?: boolean }) => (
    <button
      onClick={() => setAskOpen(true)}
      className={`inline-flex items-center justify-center h-12 rounded-[15px] px-6 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(234,88,12,0.55)] bg-gradient-to-b from-[hsl(28_95%_58%)] to-[hsl(20_90%_48%)] hover:brightness-[1.06] active:scale-[0.98] transition-all duration-200 ${full ? "w-full sm:w-auto" : ""}`}
    >
      Ask a Question
    </button>
  );

  return (
    <section className="max-w-7xl mx-auto pt-2 pb-16">
      {/* Unified premium header — the ONLY heading in this section */}
      <div className="mb-5 sm:mb-6">
        <h2 className="text-[24px] sm:text-[28px] font-display font-semibold tracking-tight text-foreground">
          FAQ &amp; Questions
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Browse official answers or ask our team about this product.
        </p>
      </div>

      {/* Unified search — hidden only when the whole section is empty */}
      {!isEmpty && (
        <div className="mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search FAQs and questions…"
              className="w-full h-11 bg-card border border-border rounded-full pl-11 pr-4 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10 transition"
            />
          </div>
        </div>
      )}

      {/* v6.3 — Official Product Support info card + single primary CTA */}
      {!isEmpty && (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5 flex items-start gap-4">
          <div className="shrink-0 size-10 rounded-xl grid place-items-center bg-accent/10 border border-accent/20 text-accent">
            <MessageCircleQuestion className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] sm:text-sm font-display font-semibold text-foreground">
              Official Product Support
            </p>
            <p className="mt-0.5 text-[12px] sm:text-[13px] text-muted-foreground leading-relaxed">
              Our FoundOurMarket™ team typically responds within 24–48 hours.
            </p>
          </div>
          <div className="hidden sm:block shrink-0">
            <AskCta />
          </div>
        </div>
      )}
      {!isEmpty && (
        <div className="mb-6 sm:hidden">
          <AskCta full />
        </div>
      )}


      {/* Admin FAQs — accordion only rendered when data exists */}
      {hasFaqs && (
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
              Product FAQ
            </h3>
            <span className="text-[11px] text-muted-foreground/70">
              {filteredFaqs.length} of {faqs.length}
            </span>
          </div>

          {filteredFaqs.length === 0 ? (
            <p className="rounded-[18px] border border-white/10 bg-white/[0.02] px-4 py-6 text-center text-sm text-muted-foreground">
              No FAQs match your search.
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredFaqs.map((f) => {
                const open = openId === f.id;
                return (
                  <li
                    key={f.id}
                    id={`faq-${f.id}`}
                    className={`rounded-[18px] border transition-colors scroll-mt-24 ${open ? "border-accent/40 bg-white/[0.04]" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : f.id)}
                      className="w-full flex items-start gap-3 px-4 sm:px-5 py-4 text-left"
                    >
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/12 text-[11px] font-semibold text-accent">
                        Q
                      </span>
                      <span className="flex-1 text-[15px] font-medium leading-snug text-foreground">
                        {f.question}
                      </span>
                      <ChevronDown
                        className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180 text-accent" : ""}`}
                      />
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    >
                      <div className="overflow-hidden">
                        <div className="px-4 sm:px-5 pb-4 pl-[52px] sm:pl-[60px] text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                          {f.answer}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Community Questions section label (only when both FAQs and Qs exist) */}
      {hasFaqs && hasQuestions && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            Customer Questions
          </h3>
        </div>
      )}

      {/* Community Q&A — always mounted (owns realtime + posting). */}
      <IsolatedBoundary name="product-qa">
        <Suspense
          fallback={
            <div className="py-10 grid place-items-center text-xs text-muted-foreground">
              <MessageCircleQuestion className="size-5 opacity-60" />
            </div>
          }
        >
          <ProductQA
            productSlug={productSlug}
            hideHeader
            externalSearch={search}
            hideAskCta
            hideEmptyState
            askOpen={askOpen}
            onAskOpenChange={setAskOpen}
            onCountChange={setQuestionCount}
          />
        </Suspense>
      </IsolatedBoundary>

      {/* Unified premium empty state — no FAQs AND no community questions */}
      {isEmpty && (
        <div className="py-16 px-6 text-center rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="mx-auto mb-5 size-16 rounded-2xl grid place-items-center bg-accent/10 border border-accent/20 text-accent">
            <MessageCircleQuestion className="size-7" strokeWidth={1.5} />
          </div>
          <p className="text-lg font-display font-semibold mb-1.5">No questions yet</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed mb-6">
            Have a question about this product? Ask us and our team will respond.
          </p>
          <div className="max-w-xs mx-auto">
            <AskCta full />
          </div>
        </div>
      )}

      {/* Repeat CTA at end of a long list (never duplicated within the viewport
          because it sits after the paginated list). */}
      {!isEmpty && hasQuestions && (questionCount ?? 0) >= 4 && (
        <div className="mt-8 flex justify-center">
          <AskCta />
        </div>
      )}

      {faqLoading && <span className="sr-only">Loading FAQs…</span>}
    </section>
  );
}

export default PDPFaqAndQuestions;
