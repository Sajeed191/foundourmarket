/**
 * v10.0 — Executive report. Printable summary for today / yesterday / week /
 * month with CSV, print and PDF (via print dialog) export.
 */
import { Printer, Download, FileText } from "lucide-react";
import type { ExecutiveReport, ReportRange } from "@/lib/flash/flash-executive";
import { money, reportToCsv } from "@/lib/flash/flash-executive";

const RANGES: { key: ReportRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export function FlashExecutiveReport({
  report, range, onRange,
}: {
  report: ExecutiveReport;
  range: ReportRange;
  onRange: (r: ReportRange) => void;
}) {
  function exportCsv() {
    const blob = new Blob([reportToCsv(report)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flash-deals-report-${report.range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const btn = "inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 px-3.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => onRange(r.key)}
            className={`rounded-full border px-3 min-h-9 text-[10px] font-mono uppercase tracking-widest transition ${
              range === r.key ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}>
            {r.label}
          </button>
        ))}
        <span className="grow" />
        <button onClick={exportCsv} className={btn}><Download className="size-3.5" /> CSV</button>
        <button onClick={() => window.print()} className={btn}><Printer className="size-3.5" /> Print</button>
        <button onClick={() => window.print()} className={btn}><FileText className="size-3.5" /> PDF</button>
      </div>

      <div id="flash-executive-report" className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">FoundOurMarket™ · Flash Deals</p>
          <h4 className="font-display text-lg font-semibold">{report.label} summary</h4>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Revenue" value={money(report.revenue)} />
          <Stat label="Orders" value={String(report.orders)} />
          <Stat label="Views" value={money(report.views)} />
          <Stat label="Clicks" value={money(report.clicks)} />
          <Stat label="CTR" value={`${report.ctr.toFixed(1)}%`} />
          <Stat label="Conversion" value={`${report.conversion.toFixed(1)}%`} />
        </div>

        <Block title="Best performers">
          {report.best.length === 0 ? <Empty /> : report.best.map((b) => (
            <Row key={b.name} left={b.name} right={`${money(b.revenue)} · ${b.ctr.toFixed(1)}% CTR`} />
          ))}
        </Block>

        <Block title="Needs attention">
          {report.worst.length === 0 ? <Empty /> : report.worst.map((b) => (
            <Row key={b.name} left={b.name} right={`${b.views} views · ${b.ctr.toFixed(1)}% CTR`} />
          ))}
        </Block>

        <Block title="Campaign summary">
          {report.campaigns.length === 0 ? <Empty /> : report.campaigns.map((c) => (
            <Row key={c.name} left={c.name} right={`${c.status} · score ${c.score} · ${money(c.revenue)}`} />
          ))}
        </Block>

        <Block title="Inventory summary">
          <Row left="Safe stock" right={String(report.inventory.safe)} />
          <Row left="Low stock" right={String(report.inventory.low)} />
          <Row left="Out of stock" right={String(report.inventory.out)} />
        </Block>

        <Block title="Recommendations">
          {report.recommendations.length === 0 ? <Empty /> : report.recommendations.map((r) => (
            <p key={r} className="text-[11px] leading-relaxed text-foreground/85">· {r}</p>
          ))}
        </Block>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
      <p className="truncate text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 py-1.5 last:border-0">
      <p className="truncate text-[12px]">{left}</p>
      <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{right}</p>
    </div>
  );
}

function Empty() {
  return <p className="text-[11px] text-muted-foreground">No data in this period.</p>;
}
