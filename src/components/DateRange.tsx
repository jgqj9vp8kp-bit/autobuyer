"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { RefreshCw } from "lucide-react";

const iso = (d: Date) => d.toISOString().slice(0, 10);

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "Вчера", days: 1 },
  { label: "7 дней", days: 7 },
  { label: "14 дней", days: 14 },
  { label: "30 дней", days: 30 },
];

export function DateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const apply = (f: string, t: string, refresh = false) => {
    const p = new URLSearchParams(sp.toString());
    p.set("from", f);
    p.set("to", t);
    if (refresh) p.set("r", String(Date.now()));
    else p.delete("r");
    start(() => router.push(`${pathname}?${p.toString()}`));
  };

  const preset = (days: number) => {
    const t = new Date();
    if (days === 1) t.setDate(t.getDate() - 1);
    const f = new Date(t);
    f.setDate(t.getDate() - (days - 1));
    apply(iso(f), iso(t));
  };

  const activeDays = (() => {
    const d = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1;
    return Math.round(d);
  })();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => preset(p.days)}
            className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", activeDays === p.days ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <input type="date" className="input" value={from} max={to} onChange={(e) => apply(e.target.value, to)} />
      <span className="text-xs text-muted">—</span>
      <input type="date" className="input" value={to} min={from} onChange={(e) => apply(from, e.target.value)} />
      <button className="btn btn-ghost" onClick={() => apply(from, to, true)} title="Обновить данные из источников">
        <RefreshCw size={14} className={clsx(pending && "animate-spin")} />
        Обновить
      </button>
    </div>
  );
}
