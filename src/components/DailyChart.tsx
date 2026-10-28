"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyAdStats } from "@/lib/types";
import { fmtDate } from "@/lib/format";

export function DailyChart({ daily }: { daily: DailyAdStats[] }) {
  const data = [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: fmtDate(d.date),
      spend: Math.round(d.spend),
      trials: d.purchases,
      cpa: d.purchases > 0 ? Math.round((d.spend / d.purchases) * 100) / 100 : null,
    }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eae7ec" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} width={48} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #eae7ec", fontSize: 12 }}
            formatter={(v: number, n: string) => [n === "spend" ? `$${v}` : n === "cpa" ? `$${v}` : v, n === "spend" ? "Расход" : n === "cpa" ? "CPA" : "Триалы"]}
          />
          <Bar yAxisId="left" dataKey="spend" fill="#ffe16b" radius={[6, 6, 0, 0]} />
          <Line yAxisId="right" dataKey="cpa" stroke="#140f23" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
