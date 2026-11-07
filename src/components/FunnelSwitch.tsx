"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { fmtMoney } from "@/lib/format";
import { NO_FUNNEL, type FunnelOption } from "@/lib/funnels";

/** Выбор воронки: пишет ?funnel=… в URL, остальные параметры сохраняет. В пункте — сколько объектов и расход. */
export function FunnelSwitch({ value, options, total, unit }: { value: string | null; options: FunnelOption[]; total: number; unit: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const select = (f: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (f) q.set("funnel", f);
    else q.delete("funnel");
    q.delete("r");
    start(() => router.push(`${pathname}?${q.toString()}`));
  };

  const label = (o: FunnelOption) => `${o.key === NO_FUNNEL ? "не определена" : o.key} · ${o.count} ${unit}${o.spend > 0 ? ` · ${fmtMoney(o.spend)}` : ""}`;

  return (
    <label className={clsx("flex max-w-full items-center gap-2 rounded-full border border-line bg-white py-1 pl-3 pr-1 text-xs", pending && "opacity-60")}>
      <span className="shrink-0 font-semibold text-muted">Воронка</span>
      <select
        value={value ?? ""}
        onChange={(e) => select(e.target.value || null)}
        className={clsx("min-w-0 max-w-[360px] cursor-pointer truncate rounded-full px-3 py-1.5 font-semibold outline-none", value ? "bg-ink text-white" : "bg-subtle text-ink")}
      >
        <option value="" className="bg-white text-ink">
          Все воронки · {total} {unit}
        </option>
        {options.map((o) => (
          <option key={o.key} value={o.key} className="bg-white text-ink">
            {label(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
