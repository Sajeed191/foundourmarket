import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ChevronDown, MessageCircleQuestion, Search, Sparkles } from "lucide-react";
import { fetchActiveFaqs, type ProductFaq } from "@/lib/product-faqs";
import IsolatedBoundary from "@/components/site/IsolatedBoundary";

const ProductQA = lazy(() =>
  import("@/components/site/ProductQA").then((m) => ({ default: m.ProductQA })),
);

/**
 * PDP v6.0 — Unified "FAQ & Questions" section.
 *
 * Combines admin-managed Product FAQs (top) with the community Q&A component
 * (bottom) under a single premium heading and one shared search input.
 *
 * - Reuses existing admin FAQs via `fetchActiveFaqs` (no new table).
 * - Delegates all Q&A behavior to <ProductQA /> with `hideHeader` +
 *   `externalSearch` so nothing about permissions, moderation, realtime or
 *   posting changes.
 * - Empty states follow the v6.0 spec (FAQ-only, Q&A-only, or neither).
 */
export function PDPFaqAndQuestions({ productSlug }: { productSlug: string }) {
  const [faqs, setFaqs] = useState<ProductFaq[]>([]);
  const [faqLoading, setFaqLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFaqLoading(true);
    fetchActiveFaqs(productSlug)
      .then((rows) => {
        if (cancelled) return;
        setFaqs(rows);
        // Deep-link: open+scroll the FAQ if #faq-<id> is present, else open first.
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
      (f) =>
        f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
    );
  }, [faqs, search]);

  const hasAnyFaqs = faqs.length > 0;
  const showSearch = hasAnyFaqs; // ProductQA still renders its own search when empty

  return (
    <section className="max-w-7xl mx-auto pt-2 pb-16">
      {/* Unified premium header */}
      <div className="mb-5 sm:mb-6">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/80">
          <Sparkles className="size-3.5 text-accent" />
          Help & Answers
        </div>
        <h2 className="mt-2 text-[24px] sm:text-[28px] font-display font-semibold tracking-tight text-foreground">
          FAQ &amp; Questions
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
          Find answers instantly or ask a new question.
        </p>
      </div>

      {/* Unified search — searches both FAQs and Questions */}
      {showSearch && (
        <div className="mb-5">
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

      {/* Product FAQ (admin) — accordion */}
      {hasAnyFaqs && (
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

      {/* Customer Questions */}
      {hasAnyFaqs && (
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            Customer Questions
          </h3>
        </div>
      )}

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
            hideHeader={hasAnyFaqs}
            externalSearch={hasAnyFaqs ? search : undefined}
          />
        </Suspense>
      </IsolatedBoundary>

      {/* Screen-reader hint while FAQs are still loading */}
      {faqLoading && <span className="sr-only">Loading FAQs…</span>}
    </section>
  );
}

export default PDPFaqAndQuestions;
