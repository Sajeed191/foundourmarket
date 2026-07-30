import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { getSetupState, createSuperAdminAccount } from "@/lib/setup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "First-Time Setup — FoundOurMarket" },
      { name: "description", content: "Create the first super admin account to activate your FoundOurMarket marketplace installation." },
      { property: "og:title", content: "First-Time Setup — FoundOurMarket" },
      { property: "og:description", content: "Secure first boot: create your super admin and bring the marketplace online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: "At least 12 characters", test: (p) => p.length >= 12 },
  { label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "A number", test: (p) => /\d/.test(p) },
  { label: "A symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function SetupPage() {
  const state = useServerFn(getSetupState);
  const create = useServerFn(createSuperAdminAccount);

  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try { setNeedsSetup((await state()).needsSetup); }
      catch { setNeedsSetup(true); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strong = RULES.every((r) => r.test(password));
  const ready = strong && password === confirm && email.includes("@") && !busy;

  async function submit() {
    setBusy(true);
    try {
      const res = await create({
        data: { email, password, redirectTo: `${window.location.origin}/auth/callback` },
      } as never);
      setDone(res.email);
    } catch (e) {
      toast.error((e as Error).message ?? "Could not create the super admin account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[80vh] px-5 py-16 grid place-items-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="size-12 mx-auto grid place-items-center rounded-2xl border border-border bg-accent/10 text-accent">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold mt-4">First-time setup</h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            This installation has no administrator. Create the super admin account to bring the
            marketplace online.
          </p>
        </div>

        {needsSetup === null && (
          <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        )}

        {needsSetup === false && (
          <div className="card-premium rounded-3xl p-6 text-center">
            <CheckCircle2 className="size-6 mx-auto text-emerald-400" />
            <h2 className="font-display text-base font-semibold mt-3">Setup already complete</h2>
            <p className="text-sm text-muted-foreground mt-2">A super admin already exists for this marketplace.</p>
            <Link to="/auth" className="inline-block mt-5 px-5 py-3 rounded-full text-[11px] uppercase tracking-widest font-bold border border-border">
              Go to sign in
            </Link>
          </div>
        )}

        {needsSetup && done && (
          <div className="card-premium rounded-3xl p-6 text-center">
            <MailCheck className="size-6 mx-auto text-accent" />
            <h2 className="font-display text-base font-semibold mt-3">Verify your email</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a verification link to <span className="font-medium text-foreground">{done}</span>.
              Confirm it, then sign in — super admin access is granted automatically. Enable
              multi-factor authentication from your account security settings straight after.
            </p>
            <Link to="/auth" className="inline-block mt-5 px-5 py-3 rounded-full text-[11px] uppercase tracking-widest font-bold bg-accent text-accent-foreground">
              Continue to sign in
            </Link>
          </div>
        )}

        {needsSetup && !done && (
          <div className="card-premium rounded-3xl p-6 space-y-4">
            <div>
              <label className="block text-sm mb-2">Super admin email</label>
              <input
                type="email" value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourdomain.com"
                className="w-full rounded-2xl bg-background/60 border border-border px-4 py-3 text-sm outline-none focus:border-accent/60"
              />
            </div>
            <div>
              <label className="block text-sm mb-2">Password</label>
              <input
                type="password" value={password} autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl bg-background/60 border border-border px-4 py-3 text-sm outline-none focus:border-accent/60"
              />
              <ul className="mt-3 space-y-1">
                {RULES.map((r) => (
                  <li key={r.label} className={`text-[11px] flex items-center gap-2 ${r.test(password) ? "text-emerald-400" : "text-muted-foreground"}`}>
                    <CheckCircle2 className="size-3" /> {r.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label className="block text-sm mb-2">Confirm password</label>
              <input
                type="password" value={confirm} autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-2xl bg-background/60 border border-border px-4 py-3 text-sm outline-none focus:border-accent/60"
              />
              {confirm.length > 0 && confirm !== password && (
                <p className="text-[11px] text-destructive mt-2">Passwords do not match.</p>
              )}
            </div>
            <button
              type="button" disabled={!ready} onClick={() => void submit()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full text-[11px] uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Creating account…" : "Create super admin"}
            </button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Email verification is required before the account can sign in. Exactly one super admin
              is created here; Admin stays locked until verification completes.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
