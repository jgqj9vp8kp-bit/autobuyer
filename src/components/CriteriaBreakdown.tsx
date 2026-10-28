import clsx from "clsx";
import type { CriterionResult } from "@/lib/types";
import { GROUP_LABEL } from "@/lib/verdict";
import { StatusDot } from "@/components/ui";

export function CriteriaBreakdown({ criteria }: { criteria: CriterionResult[] }) {
  const groups = ["funnel", "monetization", "ads", "quality"] as const;
  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const items = criteria.filter((c) => c.group === g);
        if (!items.length) return null;
        const earned = items.reduce((s, c) => s + c.points, 0);
        const possible = items.filter((c) => c.status !== "na").reduce((s, c) => s + c.maxPoints, 0);
        return (
          <div key={g}>
            <div className="mb-2 flex items-center justify-between">
              <div className="kicker">{GROUP_LABEL[g]}</div>
              <div className="text-xs font-semibold text-muted">
                {Math.round(earned * 10) / 10} / {possible}
              </div>
            </div>
            <div className="space-y-1.5">
              {items.map((c) => {
                const share = c.maxPoints > 0 ? c.points / c.maxPoints : 0;
                return (
                  <div key={c.key} className={clsx("grid grid-cols-[14px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2", c.status === "bad" ? "bg-danger-soft/60" : "bg-subtle/60")}>
                    <StatusDot status={c.status} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">{c.label}</div>
                      <div className="truncate text-xs text-muted">{c.note}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
                        <div className={clsx("h-full rounded-full", c.status === "good" ? "bg-success" : c.status === "warn" ? "bg-warn" : c.status === "bad" ? "bg-danger" : "bg-line")} style={{ width: `${share * 100}%` }} />
                      </div>
                      <div className="w-14 text-right text-sm font-semibold tabular-nums">
                        {c.status === "na" ? "—" : c.points}
                        <span className="text-xs font-normal text-muted">/{c.maxPoints}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
