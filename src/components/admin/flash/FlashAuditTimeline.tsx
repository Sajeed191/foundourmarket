/**
 * Audit timeline — automated Flash Deal audit runs plus recent admin activity
 * on flash deals, read from the existing logging tables.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AuditRow } from "@/lib/flash/use-flash-admin";

type ActivityRow = {
  id: number;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  metadata: unknown;
};

export function FlashAuditTimeline({ audit }: { audit: AuditRow[] }) {
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    let active = true;
    void supabase
      .from("admin_activity_logs")
      .select("id,action,entity_type,entity_id,created_at,metadata")
      .eq("entity_type", "flash_deal")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (active) setActivity((data as ActivityRow[] | null) ?? []);
      });
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">Admin actions</p>
        {activity.length === 0 ? (
          <p className="text-xs text-muted-foreground">No flash deal actions logged yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono text-foreground/80">{new Date(a.created_at).toLocaleString()}</span>
                <span className="text-foreground">{a.action.replace(/_/g, " ")}</span>
                {a.entity_id && <span className="font-mono opacity-70">{a.entity_id.slice(0, 8)}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">Automatic audit runs</p>
        {audit.length === 0 ? (
          <p className="text-xs text-muted-foreground">No audit runs recorded yet.</p>
        ) : (
          <ol className="space-y-1.5">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono text-foreground/80">{new Date(a.ran_at).toLocaleString()}</span>
                <span>expired <b className="text-foreground">{a.expired_deactivated}</b></span>
                <span>invalid <b className="text-foreground">{a.invalid_product_deactivated}</b></span>
                <span>out-of-stock <b className="text-foreground">{a.out_of_stock_deactivated}</b></span>
                <span>duplicates <b className="text-foreground">{a.duplicates_found}</b></span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
