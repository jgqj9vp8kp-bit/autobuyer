import clsx from "clsx";
import Link from "next/link";
import type { EvaluationResponse } from "@/lib/types";

const NAME: Record<string, string> = { capsuled: "Дашборд баеров", posthog: "PostHog", demo: "Демо-данные" };

export function SourcesBar({ data }: { data: EvaluationResponse }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={clsx("rounded-full px-2.5 py-1 font-semibold", data.mode === "live" ? "bg-success-soft text-success" : "bg-accent-soft text-ink")}>{data.mode === "live" ? "LIVE" : "DEMO"}</span>
      {data.sources.map((s) => (
        <span key={s.source} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-muted" title={s.message}>
          <span className={clsx("h-1.5 w-1.5 rounded-full", s.ok ? "bg-success" : "bg-danger")} />
          {NAME[s.source] ?? s.source}
        </span>
      ))}
      <Link href="/settings" className="text-muted underline-offset-2 hover:underline">
        настроить источники
      </Link>
    </div>
  );
}
