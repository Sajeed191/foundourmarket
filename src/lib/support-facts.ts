import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PresenceState } from "@/lib/support-analytics";

/**
 * Support & Seller Assistance v2.0 — Real Support Presence.
 *
 * Every value here comes from the `support_service_facts()` backend function,
 * which reads real agent activity, real ticket timestamps and the configured
 * store support settings. Nothing is estimated, randomised or simulated.
 * When a value has no evidence it is `null`, and the UI must render an honest
 * "unavailable" state instead of a number.
 *
 * Privacy: the backend returns aggregates only — no names, emails, phone
 * numbers, message bodies, ids, IPs or tokens.
 */

export type SupportFacts = {
  /** Derived from real agent activity heartbeats. */
  presence: PresenceState;
  onlineCount: number;
  awayCount: number;
  lastActiveAt: string | null;
  /** Real average first reply, minutes. Null when there is no history. */
  avgFirstResponseMinutes: number | null;
  firstResponseSample: number;
  /** Real average resolution, hours. Null when there is no history. */
  avgResolutionHours: number | null;
  resolutionSample: number;
  /** Real count of requests still awaiting handling. */
  openTickets: number | null;
  /** Configured (admin-set) values, not measurements. */
  configuredStatus: string | null;
  configuredResponseMinutes: number | null;
  whatsappNumbers: string[] | null;
};

export type SupportFactsState = {
  data: SupportFacts | null;
  loading: boolean;
  /** True when the backend could not be reached — show "Currently unavailable". */
  unavailable: boolean;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function parse(raw: Record<string, unknown>): SupportFacts {
  const online = num(raw.online_count) ?? 0;
  const away = num(raw.away_count) ?? 0;
  return {
    presence: online > 0 ? "online" : away > 0 ? "away" : "offline",
    onlineCount: online,
    awayCount: away,
    lastActiveAt: (raw.last_active_at as string | null) ?? null,
    avgFirstResponseMinutes: num(raw.avg_first_response_minutes),
    firstResponseSample: num(raw.first_response_sample) ?? 0,
    avgResolutionHours: num(raw.avg_resolution_hours),
    resolutionSample: num(raw.resolution_sample) ?? 0,
    openTickets: num(raw.open_tickets),
    configuredStatus: (raw.configured_status as string | null) ?? null,
    configuredResponseMinutes: num(raw.configured_response_minutes),
    whatsappNumbers: Array.isArray(raw.whatsapp_numbers)
      ? (raw.whatsapp_numbers as string[])
      : null,
  };
}

/**
 * Read-only support facts. Single query, cached in module scope for the
 * session, refreshed on a slow poll and when the tab becomes visible again.
 */
let cache: { at: number; facts: SupportFacts } | null = null;
const CACHE_MS = 60_000;

export function useSupportFacts(): SupportFactsState {
  const [state, setState] = useState<SupportFactsState>(() => ({
    data: cache?.facts ?? null,
    loading: !cache,
    unavailable: false,
  }));
  const mounted = useRef(true);

  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) {
      setState({ data: cache.facts, loading: false, unavailable: false });
      return;
    }
    const { data, error } = await (supabase.rpc as never as (
      fn: string,
    ) => Promise<{ data: unknown; error: unknown }>)("support_service_facts");
    if (!mounted.current) return;
    if (error || !data || typeof data !== "object") {
      setState((s) => ({ data: s.data, loading: false, unavailable: !s.data }));
      return;
    }
    const facts = parse(data as Record<string, unknown>);
    cache = { at: Date.now(), facts };
    setState({ data: facts, loading: false, unavailable: false });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const poll = setInterval(() => void load(true), 90_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return state;
}

/** "12 min" / "3.4 h" / null when there is no evidence. */
export function fmtMinutes(mins: number | null): string | null {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return null;
  if (mins < 1) return "under a minute";
  if (mins < 90) return `${Math.round(mins)} min`;
  const h = mins / 60;
  if (h < 48) return `${h < 10 ? h.toFixed(1) : Math.round(h)} h`;
  return `${Math.round(h / 24)} d`;
}

/** "3.4 h" / "2 d" / null when there is no evidence. */
export function fmtHours(hours: number | null): string | null {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return null;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
