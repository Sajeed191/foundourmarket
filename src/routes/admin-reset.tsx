import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getResetPreview, runProductionReset, RESET_PHRASE } from "@/lib/production-reset.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-reset")({
  head: () => ({
    meta: [
      { title: "Production Reset — FoundOurMarket Admin" },
      { name: "description", content: "One-time production reset that clears customer-generated marketplace data while preserving catalog, vendors and configuration." },
      { property: "og:title", content: "Production Reset — FoundOurMarket Admin" },
      { property: "og:description", content: "Clear customer data before launch while keeping the marketplace fully configured." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

type Preview = Awaited<ReturnType<typeof getResetPreview>>;
type Report = Awaited<ReturnType<typeof runProductionReset>>;

const TOGGLES = [
  { key: "deleteAccounts", label: "Delete customer accounts", hint: "Removes customer logins. Admins, staff and vendors are always kept." },
  { key: "deleteWaitlist", label: "Delete waitlist", hint: "International waitlist entries." },
  { key: "deleteNewsletter", label: "Delete newsletter subscribers", hint: "Subscribers and their signup audit trail." },
  { key: "deleteSupport", label: "Delete support tickets", hint: "Tickets, messages, notes and ratings." },
  { key: "deleteAnalytics", label: "Delete analytics events", hint: "Page views, sessions and search history." },
  { key: "deleteReviewImages", label: "Delete review images", hint: "Customer-uploaded review photos and videos." },
] as const;

type OptKey = (typeof TOGGLES)[number]["key"];

function ResetPage() {
  const preview = useServerFn(getResetPreview);
  const run = useServerFn(runProductionReset);

  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [opts, setOpts] = useState<Record<OptKey, boolean>>({
    deleteAccounts: false,
    deleteWaitlist: true,
    deleteNewsletter: true,
    deleteSupport: true,
    deleteAnalytics: true,
    deleteReviewImages: true,
  });

  async function load() {
    setLoading(true);
    try { setData(await preview({ data: {} } as never)); }
    catch (e) { toast.error((e as Error).message ?? "Failed to load preview"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const armed = phrase.trim() === RESET_PHRASE && !busy;

  async function execute() {
    setBusy(true);
    try {
      const res = await run({ data: { ...opts, confirm: phrase.trim() } } as never);
      setReport(res);
      setPhrase("");
      if (res.failures.length) toast.warning(`Reset finished with ${res.failures.length} issue(s).`);
      else toast.success("Marketplace reset complete.");
      await load();
    } catch (e) {
      toast.error((e as Error).message ?? "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Production reset"
      subtitle="Clear customer data — keep the marketplace exactly as configured"
      allow={["super_admin"]}
    >
      <div className="space-y-6 pb-24">
        {/* Warning */}
        <div className="card-premium rounded-3xl p-6 border border-destructive/30">
          <div className="flex items-start gap-4">
            <div className="size-11 rounded-2xl grid place-items-center bg-destructive/15 text-destructive shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">Production Reset</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                This action permanently deletes customer-generated marketplace data. Products,
                categories, inventory, vendors, admin accounts, AI configuration, flash deals and
                security settings are never touched.
              </p>
            </div>
          </div>
        </div>

        {/* Scope preview */}
        <div className="card-premium rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              What will be removed
            </h3>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          {loading && !data ? (
            <div className="py-10 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.groups ?? []).map((g) => (
                <div key={g.key} className="rounded-2xl border border-border/70 p-4">
                  <div className="text-2xl font-display font-semibold tabular-nums">{g.total.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-1">{g.label}</div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">{g.tables.length} tables</div>
                </div>
              ))}
              <div className="rounded-2xl border border-border/70 p-4">
                <div className="text-2xl font-display font-semibold tabular-nums">{(data?.profiles ?? 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">Customer profiles</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">Only removed if enabled below</div>
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="card-premium rounded-3xl p-6">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Options</h3>
          <div className="space-y-1.5">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-start gap-3 rounded-2xl p-3 hover:bg-white/5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={opts[t.key]}
                  onChange={(e) => setOpts((p) => ({ ...p, [t.key]: e.target.checked }))}
                  className="mt-1 size-4 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{t.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Preserved */}
        <div className="card-premium rounded-3xl p-6">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-emerald-400" /> Always preserved
          </h3>
          <div className="flex flex-wrap gap-2">
            {["Products", "Categories", "Variants", "Inventory", "Images", "Catalog & Image Intelligence", "AI settings", "Flash deals", "Coupons", "Site rules", "CMS", "Shipping & tax", "Payment gateways", "SEO", "Vendors & KYC", "Roles & permissions", "Security", "Schema & policies"].map((x) => (
              <span key={x} className="px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest border border-border/70 text-muted-foreground">{x}</span>
            ))}
          </div>
        </div>

        {/* Confirmation */}
        <div className="card-premium rounded-3xl p-6 border border-destructive/30">
          <label className="block text-sm mb-2">
            Type <span className="font-mono font-bold text-destructive">{RESET_PHRASE}</span> to enable the reset button.
          </label>
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={RESET_PHRASE}
            className="w-full rounded-2xl bg-background/60 border border-border px-4 py-3 text-sm font-mono tracking-wider outline-none focus:border-destructive/60"
          />
          <button
            type="button"
            disabled={!armed}
            onClick={() => void execute()}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-[11px] uppercase tracking-widest font-bold bg-destructive text-destructive-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {busy ? "Resetting marketplace…" : "Reset my marketplace"}
          </button>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            A timestamped manifest of every row count is written to the security audit log before
            anything is deleted. If that manifest cannot be stored, the reset aborts and nothing is removed.
          </p>
        </div>

        {/* Report */}
        {report && (
          <div className="card-premium rounded-3xl p-6">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Reset report</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                ["Rows deleted", report.totalDeleted],
                ["Media removed", report.removedMedia],
                ["Accounts removed", report.removedAccounts],
                ["Products reset", report.productsReset],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border/70 p-4">
                  <div className="text-xl font-display font-semibold tabular-nums">{Number(value).toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
                </div>
              ))}
            </div>
            {report.failures.length > 0 && (
              <div className="rounded-2xl border border-destructive/40 p-4 space-y-1">
                {report.failures.map((f) => (
                  <div key={f.table} className="text-xs text-destructive font-mono">{f.table}: {f.error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
