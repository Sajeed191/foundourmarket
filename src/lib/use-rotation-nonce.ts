import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPublicMarketplaceState } from "@/lib/marketplace-state.functions";

/**
 * Global manual-reshuffle nonce. Admins can trigger an instant reshuffle of all
 * rotating collections (Best Sellers, Trending, Flash Deals) by bumping this
 * value. It is combined with the time-based rotation seed everywhere, so a bump
 * re-randomizes the order for every visitor immediately (via realtime), while
 * the regular 12:00 AM / PM rotation still applies on top.
 *
 * `rotation_state` is staff-only at the database level, so the value is read
 * through the secure server function which exposes just the nonce.
 */
let sharedNonce: Promise<number> | null = null;
/** One shared in-flight request per page load — many components use this hook. */
function loadNonceOnce(): Promise<number> {
  if (!sharedNonce) {
    sharedNonce = getPublicMarketplaceState()
      .then((s) => Number(s.rotationNonce) || 0)
      .catch(() => {
        sharedNonce = null;
        return 0;
      });
  }
  return sharedNonce;
}

export function useRotationNonce(): number {
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const value = await loadNonceOnce();
      if (active) setNonce(value);
    };
    load();


    // Realtime is still bound for staff sessions (customers are filtered out by
    // RLS and simply receive nothing). A light refresh on tab focus + a slow
    // interval keeps customer sessions eventually consistent after a reshuffle.
    const channel = supabase
      .channel(`rotation-state-live-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rotation_state" },
        (payload) => {
          const row = payload.new as { nonce?: number } | null;
          if (row && row.nonce != null) setNonce(Number(row.nonce) || 0);
        },
      )
      .subscribe();

    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    const poll = setInterval(load, 5 * 60_000);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  return nonce;
}


/**
 * Triggers a global reshuffle of all rotating collections. Admin-only (enforced
 * by RLS). Returns true on success.
 */
export async function triggerGlobalReshuffle(): Promise<boolean> {
  const nonce = Date.now();
  const { data, error } = await supabase
    .from("rotation_state")
    .update({ nonce, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("nonce");
  // RLS can silently block the update (0 rows affected) without an error;
  // requiring a returned row guarantees the reshuffle actually persisted.
  return !error && Array.isArray(data) && data.length > 0;
}
