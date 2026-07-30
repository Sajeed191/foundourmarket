import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTrafficV10, type TrafficV10 } from "@/lib/traffic-v10";

/**
 * Traffic Intelligence v10 hook — realtime (debounced) + 20s poll fallback.
 * Read-only; mirrors the existing intelligence hook's lifecycle discipline.
 */
export function useTrafficV10(days: number, enabled = true) {
  const [data, setData] = useState<TrafficV10 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchTrafficV10(days);
      if (mounted.current) setData(res);
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [days]);

  useEffect(() => {
    mounted.current = true;
    if (enabled) void load(false);
    return () => { mounted.current = false; };
  }, [load, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const trigger = () => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void load(true), 3000);
    };
    const suffix = Math.random().toString(36).slice(2, 8);
    const ch = supabase
      .channel(`traffic-v10-${suffix}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_events" }, trigger)
      .on("postgres_changes", { event: "*", schema: "public", table: "visitor_sessions" }, trigger)
      .subscribe();
    const poll = setInterval(() => void load(true), 20000);
    return () => {
      void supabase.removeChannel(ch);
      clearInterval(poll);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [load, enabled]);

  return { data, loading, refreshing, refresh: () => load(true) };
}
