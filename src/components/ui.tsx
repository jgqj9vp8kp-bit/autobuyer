import clsx from "clsx";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/types";
import { VERDICT_META, scoreColor } from "@/lib/verdict";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("card p-5", className)}>{children}</div>;
}

export function Kicker({ children }: { children: ReactNode }) {
  return <div className="kicker">{children}</div>;
}

export function ScoreBadge({ score, grade, size = "md" }: { score: number; grade: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-14 w-14 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div className={clsx("flex shrink-0 items-center justify-center rounded-full font-display font-bold", dims, scoreColor(score, grade))} title={`Grade ${grade}`}>
      {grade === "N/A" ? "—" : score}
    </div>
  );
}

export function VerdictPill({ verdict, className }: { verdict: Verdict; className?: string }) {
  const m = VERDICT_META[verdict];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", m.cls, className)} title={m.hint}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function KpiTile({ label, value, sub, tone = "default" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "accent" | "dark" }) {
  return (
    <div
      className={clsx(
        "rounded-[20px] p-5",
        tone === "accent" && "bg-accent text-ink",
        tone === "dark" && "bg-ink text-white",
        tone === "default" && "bg-subtle text-ink",
      )}
    >
      <div className="font-display text-3xl font-bold tracking-tight">{value}</div>
      <div className={clsx("mt-1 text-sm font-medium", tone === "dark" ? "text-white/80" : "text-ink/80")}>{label}</div>
      {sub && <div className={clsx("mt-2 text-xs", tone === "dark" ? "text-white/60" : "text-muted")}>{sub}</div>}
    </div>
  );
}

export function StatusDot({ status }: { status: "good" | "warn" | "bad" | "na" }) {
  return (
    <span
      className={clsx(
        "inline-block h-2 w-2 rounded-full",
        status === "good" && "bg-success",
        status === "warn" && "bg-warn",
        status === "bad" && "bg-danger",
        status === "na" && "bg-line",
      )}
    />
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-md bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info", className)}>{children}</span>;
}
