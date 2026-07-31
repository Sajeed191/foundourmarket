// Crisp Chat integration. The branded FoundOurMarket orb launches Crisp's
// native conversation window through its supported JavaScript API.
//
// Website ID is a public identifier (shipped in Crisp's own embed snippet).
export const CRISP_WEBSITE_ID = "e01c081c-fa06-440a-a578-99ed7f53ed1a";

declare global {
  interface Window {
    $crisp?: any[];
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: { locale?: string };
  }
}

export type CrispMessage = {
  id: string;
  from: "user" | "operator";
  text: string;
  ts: number;
};

export type Availability = "online" | "away" | "offline";

let loadPromise: Promise<void> | null = null;
let loadStart = 0;

const perf = {
  mark(name: string) {
    if (typeof performance === "undefined") return;
    try { performance.mark(`crisp:${name}`); } catch { /* noop */ }
  },
  log(msg: string) {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[crisp] ${msg}`);
    }
  },
};

// Retained only to remove the legacy rule from returning client sessions.
const HIDE_STYLE_ID = "crisp-force-hide-style";
function removeLegacyHideStyle(): void {
  if (typeof document === "undefined") return;
  document.getElementById(HIDE_STYLE_ID)?.remove();
}

// ---- Diagnostics (staff-only panel reads this; never rendered to customers) ----
export type CrispDiagnostics = {
  scriptInjected: boolean;
  scriptLoaded: boolean;
  sdkReady: boolean;
  websiteIdMasked: string;
  attempts: number;
  lastAttemptAt: number | null;
  loadDurationMs: number | null;
  lastError: string | null;
  lastJsError: string | null;
  availability: Availability | "unknown";
  retryCount: number;
  orbClickReceived: boolean;
  chatOpenCommandSent: boolean;
  chatOpenSuccess: boolean;
  lastOrbClickAt: number | null;
  lastOpenCommandAt: number | null;
};

const diag: CrispDiagnostics = {
  scriptInjected: false,
  scriptLoaded: false,
  sdkReady: false,
  websiteIdMasked: `${CRISP_WEBSITE_ID.slice(0, 4)}…${CRISP_WEBSITE_ID.slice(-4)}`,
  attempts: 0,
  lastAttemptAt: null,
  loadDurationMs: null,
  lastError: null,
  lastJsError: null,
  availability: "unknown",
  retryCount: 0,
  orbClickReceived: false,
  chatOpenCommandSent: false,
  chatOpenSuccess: false,
  lastOrbClickAt: null,
  lastOpenCommandAt: null,
};

export function getCrispDiagnostics(): CrispDiagnostics {
  return {
    ...diag,
    sdkReady: typeof window !== "undefined" && typeof (window as any).$crisp?.get === "function",
    availability: typeof window === "undefined" ? "unknown" : getAvailability(),
  };
}

const MAX_ATTEMPTS = 3;

export function loadCrisp(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadStart = typeof performance !== "undefined" ? performance.now() : 0;
  perf.mark("load-start");
  diag.attempts += 1;
  diag.lastAttemptAt = Date.now();

  loadPromise = new Promise<void>((resolve, reject) => {
    try {
      removeLegacyHideStyle();
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;

      window.$crisp.push(["safe", true]);

      const finish = () => {
        const readyStartedAt = Date.now();
        const confirmReady = () => {
          if (typeof (window as any).$crisp?.get === "function") {
            const ms = loadStart ? Math.round(performance.now() - loadStart) : 0;
            perf.mark("load-end");
            perf.log(`SDK ready in ${ms}ms`);
            diag.scriptLoaded = true;
            diag.sdkReady = true;
            diag.loadDurationMs = ms;
            diag.lastError = null;
            try {
              window.$crisp!.push(["on", "chat:opened", () => { diag.chatOpenSuccess = true; }]);
            } catch { /* diagnostics only */ }
            resolve();
            return;
          }
          if (Date.now() - readyStartedAt < 12_000) {
            window.setTimeout(confirmReady, 100);
            return;
          }
          loadPromise = null;
          diag.sdkReady = false;
          diag.lastError = "Crisp script loaded but SDK readiness timed out";
          resolve();
        };
        confirmReady();
      };

      const existing = document.getElementById("crisp-widget-script") as HTMLScriptElement | null;
      if (existing) {
        diag.scriptInjected = true;
        setTimeout(finish, 0);
        return;
      }

      const s = document.createElement("script");
      s.id = "crisp-widget-script";
      s.src = "https://client.crisp.chat/l.js";
      s.async = true;
      s.onload = finish;
      s.onerror = () => {
        loadPromise = null;
        diag.lastError = "Script blocked or failed to load (network / ad blocker / CSP)";
        perf.log("SDK failed to load");
        // Remove the dead tag so a retry can inject a fresh one.
        try { s.remove(); } catch { /* noop */ }
        diag.scriptInjected = false;
        if (diag.attempts < MAX_ATTEMPTS) {
          diag.retryCount += 1;
          const delay = 1500 * diag.attempts;
          window.setTimeout(() => { void loadCrisp().catch(() => {}); }, delay);
        }
        // Never reject loudly — chat degrades, the page keeps working.
        resolve();
      };
      document.head.appendChild(s);
      diag.scriptInjected = true;
    } catch (err) {
      loadPromise = null;
      diag.lastError = (err as Error)?.message ?? "Unknown Crisp init error";
      reject(err as Error);
    }
  });

  return loadPromise;
}


let preloaded = false;
export function preloadCrisp(): void {
  if (typeof window === "undefined" || preloaded) return;
  preloaded = true;

  const start = () => {
    perf.mark("preload-start");
    void loadCrisp().catch(() => { preloaded = false; });
  };

  const schedule = () => {
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) ric(start, { timeout: 4000 });
    else setTimeout(start, 2000);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

const OPEN_EVENT = "fom-chat:open";
const CLOSE_EVENT = "fom-chat:close";

export function markCrispOrbClick(): void {
  diag.orbClickReceived = true;
  diag.lastOrbClickAt = Date.now();
}

export async function openCrispChat(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  perf.mark("open-request");
  try {
    await loadCrisp();
    if (typeof (window as any).$crisp?.get !== "function" || !window.$crisp) {
      throw new Error(diag.lastError ?? "Crisp SDK is not ready");
    }
    window.$crisp.push(["do", "chat:show"]);
    window.$crisp.push(["do", "chat:open"]);
    diag.chatOpenCommandSent = true;
    diag.lastOpenCommandAt = Date.now();
    window.setTimeout(() => {
      diag.chatOpenSuccess = isCrispChatOpen() || diag.chatOpenSuccess;
    }, 300);
    return true;
  } catch (error) {
    diag.lastError = error instanceof Error ? error.message : "Chat open failed";
    return false;
  }
}

export function closeCrispChat(): void {
  if (typeof window === "undefined") return;
  try { window.$crisp?.push(["do", "chat:close"]); } catch { /* noop */ }
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
}

export function onChatOpenRequest(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}

export function onChatCloseRequest(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CLOSE_EVENT, cb);
  return () => window.removeEventListener(CLOSE_EVENT, cb);
}

export function isCrispChatOpen(): boolean {
  if (typeof window === "undefined") return false;
  try { return (window as any).$crisp?.get?.("chat:opened") === true; } catch { return false; }
}

export async function forceInitializeCrisp(): Promise<boolean> {
  loadPromise = null;
  try { await loadCrisp(); return typeof (window as any).$crisp?.get === "function"; } catch { return false; }
}

export async function destroyAndReloadCrisp(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  document.getElementById("crisp-widget-script")?.remove();
  document.querySelectorAll(".crisp-client, #crisp-chatbox").forEach((node) => node.remove());
  window.$crisp = [];
  loadPromise = null;
  diag.scriptInjected = false;
  diag.scriptLoaded = false;
  diag.sdkReady = false;
  return forceInitializeCrisp();
}

export function setCrispUser(opts: { email?: string; nickname?: string }): void {
  if (typeof window === "undefined") return;
  window.$crisp = window.$crisp || [];
  if (opts.email) window.$crisp.push(["set", "user:email", [opts.email]]);
  if (opts.nickname) window.$crisp.push(["set", "user:nickname", [opts.nickname]]);
}

// Attach order/customer context to the Crisp conversation so human agents see
// it without asking the customer to repeat themselves. Values must be strings.
export function setCrispSessionData(data: Record<string, string | number | null | undefined>): void {
  if (typeof window === "undefined") return;
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  const pairs = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && `${v}`.length > 0)
    .map(([k, v]) => [k, `${v}`]);
  if (pairs.length === 0) return;
  try { window.$crisp.push(["set", "session:data", [pairs]]); } catch { /* noop */ }
}


// ----- Programmatic messaging API used by the custom chat UI -----

export function sendCrispMessage(text: string): void {
  if (typeof window === "undefined" || !text.trim()) return;
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["do", "message:send", ["text", text]]);
}

let msgIdCounter = 0;
function nextId(): string {
  msgIdCounter += 1;
  return `m_${Date.now()}_${msgIdCounter}`;
}

// Subscribe to incoming operator messages. Returns an unsubscribe function.
export function onOperatorMessage(cb: (msg: CrispMessage) => void): () => void {
  if (typeof window === "undefined") return () => {};
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  const handler = (data: any) => {
    if (!data) return;
    // Only handle plain text content from operators.
    const text = typeof data.content === "string" ? data.content : "";
    if (!text) return;
    cb({
      id: nextId(),
      from: "operator",
      text,
      ts: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
    });
  };
  window.$crisp.push(["on", "message:received", handler]);
  // Crisp doesn't expose removing a single listener cleanly; the handler is
  // idempotent and the component dedupes, so we no-op on cleanup.
  return () => {};
}

// Subscribe to operator typing indicator.
export function onOperatorTyping(cb: (typing: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["on", "message:compose:received", (data: any) => {
    cb(!!(data && data.type === "start"));
  }]);
  return () => {};
}

// Subscribe to website availability (operator online/offline) changes.
export function onAvailabilityChange(cb: (a: Availability) => void): () => void {
  if (typeof window === "undefined") return () => {};
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["on", "website:availability:changed", (data: any) => {
    cb(data && data.status === "online" ? "online" : "offline");
  }]);
  return () => {};
}

export function getAvailability(): Availability {
  if (typeof window === "undefined" || !(window as any).$crisp?.get) return "away";
  try {
    const v = (window as any).$crisp.get("website:availability");
    return v === "online" ? "online" : v === "offline" ? "offline" : "away";
  } catch {
    return "away";
  }
}
