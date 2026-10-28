import clsx from "clsx";
import type { FunnelMetrics } from "@/lib/types";
import { fmtNum, fmtPct } from "@/lib/format";

export function FunnelBars({ funnel }: { funnel: FunnelMetrics }) {
  const max = Math.max(1, funnel.visitors);
  return (
    <div className="space-y-2">
      {funnel.steps.map((s, i) => {
        const width = Math.max(2, (s.count / max) * 100);
        const weak = s.fromPrev !== null && s.fromPrev < 0.4 && i > 0;
        return (
          <div key={s.key} className="grid grid-cols-[150px_1fr_80px_80px] items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 truncate">
              {s.milestone && <span className="h-1.5 w-1.5 rounded-full bg-accent-deep" title="Ключевая точка" />}
              <span className={clsx("truncate", s.milestone ? "font-semibold" : "text-muted")}>{s.label}</span>
              {s.optional && <span className="text-[10px] text-muted">(опц.)</span>}
            </div>
            <div className="flex h-6 items-center gap-2 rounded-md bg-subtle">
              <div
                className={clsx("flex h-full shrink-0 items-center justify-end rounded-md px-2 text-[11px] font-semibold", s.milestone ? "bg-accent text-ink" : "bg-ink/80 text-white")}
                style={{ width: `${width}%` }}
              >
                {width > 22 && fmtNum(s.count)}
              </div>
              {width <= 22 && <span className="text-[11px] font-semibold text-ink">{fmtNum(s.count)}</span>}
            </div>
            <div className="text-right tabular-nums text-muted">{fmtPct(s.fromStart)}</div>
            <div className={clsx("text-right tabular-nums", weak ? "font-semibold text-danger" : "text-muted")}>{i === 0 ? "—" : fmtPct(s.fromPrev)}</div>
          </div>
        );
      })}
      <div className="grid grid-cols-[150px_1fr_80px_80px] gap-3 pt-1 text-[10px] uppercase tracking-wide text-muted">
        <div />
        <div />
        <div className="text-right">от визита</div>
        <div className="text-right">от пред.</div>
      </div>
    </div>
  );
}
