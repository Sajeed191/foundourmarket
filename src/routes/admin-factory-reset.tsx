import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, Skull } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getFactoryPreview, runFactoryReset } from "@/lib/factory-reset.functions";
import { FACTORY_PHRASE, PRESERVED } from "@/lib/factory-reset.tables";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-factory-reset")({
  head: () => ({
    meta: [
      { title: "Factory Reset — FoundOurMarket Admin" },
      { name: "description", content: "Development-only factory reset that erases every account and user record while preserving products, catalog and marketplace configuration." },
      { property: "og:title", content: "Factory Reset — FoundOurMarket Admin" },
      { property: "og:description", content: "Erase all accounts and user data. Products and configuration remain intact." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FactoryResetPage,
});

type Preview = Awaited<ReturnType<typeof getFactoryPreview>>;
type Report = Awaited<ReturnType<typeof runFactoryReset>>;

function FactoryResetPage() {
  const preview = useServerFn(getFactoryPreview);
  const run = useServerFn(runFactoryReset);

  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [keepEmergencyAdmin, setKeepEmergencyAdmin] = useState(true);
  const [deleteReviewImages, setDeleteReviewImages] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  async function load() {
    setLoading(true);
    try { setData(await preview({ data: {} } as never)); }
    catch (e) { toast.error((e as Error).message ?? "Failed to load preview"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const armed = phrase.trim() === FACTORY_PHRASE && password.length > 0 && !busy;

  async function execute() {
    setBusy(true);
    setConfirmOpen(false);
    try {
      const res = await run({ data: { confirm: phrase.trim(), password, keepEmergencyAdmin, deleteReviewImages } } as never);
      setReport(res);
      setPhrase("");
      setPassword("");
      if (res.failures.length) toast.warning(`Factory reset finished with ${res.failures.length} issue(s).`);
      else toast.success("Factory reset complete.");
      await load();
    } catch (e) {
      toast.error((e as Error).message ?? "Factory reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Factory reset"
      subtitle="Development only — erases every account including administrators"
      allow={["super_admin"]}
    >
      <div className="space-y-6 pb-24">
        <div className="card-premium rounded-3xl p-6 border border-destructive/40">
          <div className="flex items-start gap-4">
            <div className="size-11 rounded-2xl grid place-items-center bg-destructive/15 text-destructive shrink-0">
              <Skull className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold">Complete factory reset</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                This permanently erases <strong>all</strong> users — customers, vendors, staff,
                admins and super admins — plus every user-generated record. Do not run this on a
                live marketplace: you will lose the ability to sign in until a new super admin is
                created through the first-time setup wizard.
              </p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Products, catalog, intelligence, configuration, storage buckets and the database
                schema are never touched.
              </p>
            </div>
          </div>
        </div>

        <div className="card-premium rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">What will be erased</h3>
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
              <div className="rounded-2xl border border-destructive/40 p-4">
                <div className="text-2xl font-display font-semibold tabular-nums text-destructive">{(data?.authUsers ?? 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">Login accounts</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">{data?.superAdmins ?? 0} super admin(s)</div>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 p-4">
                <div className="text-2xl font-display font-semibold tabular-nums text-emerald-400">{(data?.products ?? 0).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">Products preserved</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">Never deleted</div>
              </div>
            </div>
          )}
        </div>

        <div className="card-premium rounded-3xl p-6">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Options</h3>
          <label className="flex items-start gap-3 rounded-2xl p-3 hover:bg-white/5 cursor-pointer">
            <input type="checkbox" checked={keepEmergencyAdmin} onChange={(e) => setKeepEmergencyAdmin(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Keep one emergency super admin (recommended)</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Keeps only your own account and its super admin role so you cannot be locked out.
                Turn off for a true zero-account factory reset — the first-time setup wizard will
                then be required before Admin is reachable again.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl p-3 hover:bg-white/5 cursor-pointer">
            <input type="checkbox" checked={deleteReviewImages} onChange={(e) => setDeleteReviewImages(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium">Delete review media</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Customer-uploaded review photos and videos. Product images are untouched.</span>
            </span>
          </label>
        </div>

        <div className="card-premium rounded-3xl p-6">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3 flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-emerald-400" /> Always preserved
          </h3>
          <div className="flex flex-wrap gap-2">
            {PRESERVED.map((x) => (
              <span key={x} className="px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-widest border border-border/70 text-muted-foreground">{x}</span>
            ))}
          </div>
        </div>

        <div className="card-premium rounded-3xl p-6 border border-destructive/40 space-y-4">
          <div>
            <label className="block text-sm mb-2">Re-enter your password</label>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your super admin password"
              className="w-full rounded-2xl bg-background/60 border border-border px-4 py-3 text-sm outline-none focus:border-destructive/60"
            />
          </div>
          <div>
            <label className="block text-sm mb-2">
              Type <span className="font-mono font-bold text-destructive">{FACTORY_PHRASE}</span>
            </label>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={FACTORY_PHRASE}
              className="w-full rounded-2xl bg-background/60 border border-border px-4 py-3 text-sm font-mono tracking-wider outline-none focus:border-destructive/60"
            />
          </div>
          <button
            type="button"
            disabled={!armed}
            onClick={() => setConfirmOpen(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-[11px] uppercase tracking-widest font-bold bg-destructive text-destructive-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
            {busy ? "Erasing marketplace…" : "Factory reset marketplace"}
          </button>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            A timestamped manifest of every row count is written to the audit log before anything is
            deleted. If the manifest cannot be stored, the reset aborts and nothing is removed.
          </p>
        </div>

        {report && (
          <div className="card-premium rounded-3xl p-6">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-4">Reset report</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                ["Rows deleted", report.totalDeleted],
                ["Accounts removed", report.removedAccounts],
                ["Media removed", report.removedMedia],
                ["Products preserved", report.productsReset],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-border/70 p-4">
                  <div className="text-xl font-display font-semibold tabular-nums">{Number(value).toLocaleString()}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-border/70 p-4 space-y-1">
              {Object.entries(report.validation).map(([k, v]) => (
                <div key={k} className="text-xs font-mono flex items-center justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
            </div>
            {report.keptAccount && (
              <p className="text-xs text-muted-foreground mt-3">Emergency super admin kept: {report.keptAccount}</p>
            )}
            {report.failures.length > 0 && (
              <div className="rounded-2xl border border-destructive/40 p-4 space-y-1 mt-3">
                {report.failures.map((f) => (
                  <div key={f.table} className="text-xs text-destructive font-mono">{f.table}: {f.error}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-background/80 backdrop-blur-sm px-6">
          <div className="card-premium rounded-3xl p-6 max-w-md w-full border border-destructive/40">
            <h4 className="font-display text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" /> Final confirmation
            </h4>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              {keepEmergencyAdmin
                ? "Every account except yours will be permanently deleted, along with all user data. This cannot be undone."
                : "Every account — including yours — will be permanently deleted. You will be signed out and must create a new super admin through the setup wizard. This cannot be undone."}
            </p>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 px-4 py-3 rounded-full text-[11px] uppercase tracking-widest font-bold border border-border">
                Cancel
              </button>
              <button type="button" onClick={() => void execute()} className="flex-1 px-4 py-3 rounded-full text-[11px] uppercase tracking-widest font-bold bg-destructive text-destructive-foreground">
                Erase everything
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
