import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTrafficV11, type TrafficV11, type V11Filters } from "@/lib/traffic-v11";

/**
 * Conversion Intelligence v11 hook — realtime (debounced) + 30s poll fallback.
 * Read-only. Filters are applied in the aggregation pass, not by refetching.
 */
export function useTrafficV11(days: number, filters: V11Filters, enabled = true) {
  const [data, setData] = useState<TrafficV11 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const res = await fetchTrafficV11(days, JSON.parse(filterKey) as V11Filters);
      if (mounted.current) setData(res);
    } catch {
      /* analytics must never break the admin shell */
    } finally {
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [days, filterKey]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    void load();

    const poll = setInterval(() => void load(true), 30_000);
    const channel = supabase
      .channel("traffic-v11")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_events" }, () => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => void load(true), 4000);
      })
      .subscribe();

    return () => {
      mounted.current = false;
      clearInterval(poll);
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, load]);

  return { data, loading, refreshing, reload: () => load(true) };
}
