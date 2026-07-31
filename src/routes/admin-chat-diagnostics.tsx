import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw, MessageSquare } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getCrispDiagnostics, loadCrisp, openCrispChat, type CrispDiagnostics } from "@/lib/crisp";

export const Route = createFileRoute("/admin-chat-diagnostics")({
  head: () => ({
    meta: [
      { title: "Live Chat Diagnostics — Admin" },
      {
        name: "description",
        content:
          "Staff-only health view of the live chat widget: script load, website ID, readiness, availability and last error.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ChatDiagnosticsPage,
});

type Env = {
  page: string;
  browser: string;
  device: "Mobile" | "Desktop";
  orbFound: boolean;
  orbInteractive: boolean;
  bodyPointerEvents: string;
  blockingOverlay: string | null;
  consoleErrors: number;
};

function browserName(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Unknown";
}

let consoleErrorCount = 0;
if (typeof window !== "undefined" && !(window as any).__fomChatDiagHooked) {
  (window as any).__fomChatDiagHooked = true;
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrorCount += 1;
    orig(...args);
  };
}

function readEnv(): Env {
  const orb = document.querySelector('[data-fom-chat-orb="1"] button[data-floating-control]') as HTMLElement | null;
  const wrap = orb?.parentElement ?? null;
  const orbCs = orb ? getComputedStyle(orb) : null;
  const wrapCs = wrap ? getComputedStyle(wrap) : null;
  const interactive =
    !!orbCs &&
    !!wrapCs &&
    orbCs.pointerEvents !== "none" &&
    wrapCs.pointerEvents !== "none" &&
    wrapCs.visibility !== "hidden" &&
    orbCs.visibility !== "hidden" &&
    Number(wrapCs.opacity) > 0.05;

  const bodyPe = getComputedStyle(document.body).pointerEvents;
  const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
  return {
    page: location.pathname,
    browser: browserName(navigator.userAgent),
    device: window.matchMedia("(max-width: 767px)").matches ? "Mobile" : "Desktop",
    orbFound: !!orb,
    orbInteractive: interactive,
    bodyPointerEvents: bodyPe,
    blockingOverlay:
      bodyPe === "none"
        ? openDialog
          ? `Open modal: ${openDialog.getAttribute("aria-label") || openDialog.id}`
          : "Stuck scroll lock (auto-recovered by ScrollLockGuard)"
        : null,
    consoleErrors: consoleErrorCount,
  };
}

function ChatDiagnosticsPage() {
  const [diag, setDiag] = useState<CrispDiagnostics | null>(null);
  const [env, setEnv] = useState<Env | null>(null);

  const refresh = useCallback(() => {
    setDiag(getCrispDiagnostics());
    setEnv(readEnv());
  }, []);

  useEffect(() => {
    void loadCrisp();
    refresh();
    const t = window.setInterval(refresh, 2000);
    return () => window.clearInterval(t);
  }, [refresh]);

  return (
    <AdminShell title="Live Chat Diagnostics" subtitle="Staff-only widget health">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => openCrispChat()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <MessageSquare className="size-4" /> Test open chat
          </button>
        </div>

        <Section title="Widget">
          <Row label="Script injected" ok={diag?.scriptInjected} value={diag?.scriptInjected ? "Yes" : "No"} />
          <Row label="Script loaded" ok={diag?.scriptLoaded} value={diag?.scriptLoaded ? "Yes" : "No"} />
          <Row label="SDK ready ($crisp API)" ok={diag?.sdkReady} value={diag?.sdkReady ? "Ready" : "Not ready"} />
          <Row label="Website ID" ok value={diag?.websiteIdMasked ?? "—"} />
          <Row label="Availability" ok={diag?.availability === "online"} value={diag?.availability ?? "—"} />
          <Row label="Load attempts" ok value={String(diag?.attempts ?? 0)} />
          <Row
            label="Last init"
            ok
            value={diag?.lastAttemptAt ? new Date(diag.lastAttemptAt).toLocaleTimeString() : "—"}
          />
          <Row label="Load duration" ok value={diag?.loadDurationMs != null ? `${diag.loadDurationMs} ms` : "—"} />
          <Row label="Last error" ok={!diag?.lastError} value={diag?.lastError ?? "None"} />
        </Section>

        <Section title="Page & interaction">
          <Row label="Floating button present" ok={env?.orbFound} value={env?.orbFound ? "Yes" : "No"} />
          <Row label="Button clickable" ok={env?.orbInteractive} value={env?.orbInteractive ? "Yes" : "Blocked"} />
          <Row label="body pointer-events" ok={env?.bodyPointerEvents !== "none"} value={env?.bodyPointerEvents ?? "—"} />
          <Row label="Blocking overlay" ok={!env?.blockingOverlay} value={env?.blockingOverlay ?? "None"} />
          <Row label="Current page" ok value={env?.page ?? "—"} />
          <Row label="Browser" ok value={env?.browser ?? "—"} />
          <Row label="Device" ok value={env?.device ?? "—"} />
          <Row label="Console errors (this session)" ok={(env?.consoleErrors ?? 0) === 0} value={String(env?.consoleErrors ?? 0)} />
        </Section>
      </div>
    </AdminShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-medium">
        {ok ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="size-4 text-amber-500" />
        )}
        <span className="max-w-[46ch] truncate">{value}</span>
      </span>
    </div>
  );
}
