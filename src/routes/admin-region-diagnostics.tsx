import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Globe2, CheckCircle2, AlertTriangle, Play } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getRegionDiagnostics, type RegionDiagnostics } from "@/lib/region-diagnostics.functions";

export const Route = createFileRoute("/admin-region-diagnostics")({
  head: () => ({
    meta: [
      { title: "Region & Currency Diagnostics — Admin" },
      {
        name: "description",
        content:
          "Staff-only view of how a customer's market region, order currency and Razorpay UPI eligibility are resolved.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: RegionDiagnosticsPage,
});

type Overrides = {
  shippingCountry: string;
  billingCountry: string;
  profileRegion: "" | "india" | "international";
  edgeCountry: string;
  locale: string;
  timezone: string;
};

const EMPTY: Overrides = {
  shippingCountry: "",
  billingCountry: "",
  profileRegion: "",
  edgeCountry: "",
  locale: "",
  timezone: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function RegionDiagnosticsPage() {
  const run = useServerFn(getRegionDiagnostics);
  const [overrides, setOverrides] = useState<Overrides>(EMPTY);
  const [result, setResult] = useState<RegionDiagnostics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof Overrides) => (v: string) => setOverrides((o) => ({ ...o, [k]: v }));

  async function evaluate(payload: Partial<Overrides> | null) {
    setLoading(true);
    setError(null);
    try {
      const clean = payload
        ? Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== "" && v != null))
        : {};
      const res = await run({ data: clean as never });
      setResult(res);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const d = result?.decision;

  return (
    <AdminShell>
      <div className="space-y-5">
        <header className="flex items-start gap-3">
          <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h1 className="text-lg font-semibold">Region &amp; Currency Diagnostics</h1>
            <p className="text-xs text-muted-foreground">
              Staff-only. Shows which signal decides a customer's market region, the resulting order
              currency, and whether Razorpay will expose UPI. Read-only — nothing is charged or saved.
            </p>
          </div>
        </header>

        <section className="card-premium rounded-2xl p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-medium">Simulate signals (leave blank to use this request)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Shipping country" value={overrides.shippingCountry} onChange={set("shippingCountry")} placeholder="India / IN / US" />
            <Field label="Billing country" value={overrides.billingCountry} onChange={set("billingCountry")} placeholder="AE" />
            <label className="block">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Profile region</span>
              <select
                value={overrides.profileRegion}
                onChange={(e) => setOverrides((o) => ({ ...o, profileRegion: e.target.value as Overrides["profileRegion"] }))}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">(use signed-in profile)</option>
                <option value="india">india</option>
                <option value="international">international</option>
              </select>
            </label>
            <Field label="Edge geo country" value={overrides.edgeCountry} onChange={set("edgeCountry")} placeholder="IN / US / GB" />
            <Field label="Browser locale" value={overrides.locale} onChange={set("locale")} placeholder="en-IN" />
            <Field label="Browser timezone" value={overrides.timezone} onChange={set("timezone")} placeholder="Asia/Kolkata" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => evaluate(overrides)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Resolve region
            </button>
            <button
              onClick={() => {
                setOverrides(EMPTY);
                evaluate(null);
              }}
              disabled={loading}
              className="rounded-xl border border-border px-4 py-2 text-sm disabled:opacity-60"
            >
              Use my live request
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </section>

        {d && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Resolved region</p>
                <p className="mt-1.5 text-2xl font-semibold">{d.region}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Confidence {d.confidence}%</p>
              </div>
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Order currency</p>
                <p className="mt-1.5 text-2xl font-semibold">{d.currency}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">Decided by: {d.decidedBy}</p>
              </div>
              <div className="card-premium rounded-2xl p-4">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Razorpay UPI</p>
                <p className={`mt-1.5 flex items-center gap-2 text-2xl font-semibold ${d.upiEligible ? "text-emerald-400" : "text-destructive"}`}>
                  {d.upiEligible ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                  {d.upiEligible ? "Available" : "Unavailable"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {d.upiEligible ? "UPI, Netbanking, Wallets and EMI will appear." : "INR orders only."}
                </p>
              </div>
            </section>

            <section className="card-premium rounded-2xl p-4 sm:p-5">
              <h2 className="mb-2 text-sm font-medium">Why</h2>
              <p className="text-sm text-muted-foreground">{d.reason}</p>
              {d.upiUnavailableReason && (
                <p className="mt-2 text-sm text-destructive">{d.upiUnavailableReason}</p>
              )}
              {d.conflicts.length > 0 && (
                <p className="mt-2 text-sm text-amber-400">
                  Conflicting trusted signals: {d.conflicts.join(", ")}
                </p>
              )}
              {result?.simulated && (
                <p className="mt-2 text-[11px] text-muted-foreground">Simulation — overrides applied.</p>
              )}
            </section>

            <section className="card-premium rounded-2xl p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-medium">Signals considered (priority order)</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Signal</th>
                      <th className="py-2 pr-3">Value</th>
                      <th className="py-2 pr-3">Indicates</th>
                      <th className="py-2 pr-3">Trust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.signals.map((s, i) => (
                      <tr key={s.key} className={`border-t border-border/60 ${s.key === d.decidedBy ? "bg-accent/10" : ""}`}>
                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-3">{s.label}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{s.value ?? "—"}</td>
                        <td className="py-2 pr-3">{s.indicates ?? "—"}</td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{s.trusted ? "trusted" : "advisory"}</td>
                      </tr>
                    ))}
                    <tr className={`border-t border-border/60 ${d.decidedBy === "platform_fallback" ? "bg-accent/10" : ""}`}>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">9</td>
                      <td className="py-2 pr-3">Platform fallback</td>
                      <td className="py-2 pr-3 font-mono text-xs">international / USD</td>
                      <td className="py-2 pr-3">international</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">fallback</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Edge headers on this request — cf-ipcountry: {result?.headers.cfIpCountry ?? "—"} · x-vercel-ip-country:{" "}
                {result?.headers.vercelCountry ?? "—"} · timezone: {result?.headers.edgeTimezone ?? "—"}
              </p>
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
