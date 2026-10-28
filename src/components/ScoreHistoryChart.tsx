"use client";

import { Area, Bar, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScorePoint } from "@/lib/history";
import { fmtDate, fmtNum } from "@/lib/format";
import { VERDICT_META } from "@/lib/verdict";

const COLOR: Record<string, string> = { SCALE: "#1f9d5a", KEEP: "#ffc743", OPTIMIZE: "#d98a00", PAUSE: "#d93a3a", NO_DATA: "#d0cdd7" };

export function ScoreHistoryChart({ points, thresholds }: { points: ScorePoint[]; thresholds: { scale: number; keep: number; optimize: number } }) {
  const data = points.map((p) => ({ ...p, label: fmtDate(p.day), plotScore: p.verdict === "NO_DATA" ? null : p.score }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffe16b" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#ffe16b" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eae7ec" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="score" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} width={32} />
          <YAxis yAxisId="visitors" orientation="right" tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine yAxisId="score" y={thresholds.scale} stroke="#1f9d5a" strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine yAxisId="score" y={thresholds.keep} stroke="#ffc743" strokeDasharray="4 4" strokeOpacity={0.8} />
          <ReferenceLine yAxisId="score" y={thresholds.optimize} stroke="#d93a3a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #eae7ec", fontSize: 12 }}
            labelFormatter={(l) => `${l}`}
            formatter={(value, name, item) => {
              const p = (item as { payload?: ScorePoint & { plotScore: number | null } }).payload;
              const v = typeof value === "number" ? value : Number(value);
              if (name === "plotScore") return [p?.verdict === "NO_DATA" ? "нет данных" : `${v} · ${VERDICT_META[p?.verdict ?? "NO_DATA"].label}`, "Скор"];
              if (name === "visitors") return [`${fmtNum(v)} · триалов ${fmtNum(p?.trials)}`, "Визиты в окне"];
              return [String(value), String(name)];
            }}
          />
          <Bar yAxisId="visitors" dataKey="visitors" fill="#eae7ec" radius={[4, 4, 0, 0]} />
          <Area
            yAxisId="score"
            type="monotone"
            dataKey="plotScore"
            stroke="#140f23"
            strokeWidth={2}
            fill="url(#scoreFill)"
            connectNulls={false}
            dot={(props: { cx?: number; cy?: number; payload?: ScorePoint & { plotScore: number | null } }) => {
              const { cx, cy, payload } = props;
              if (cx === undefined || cy === undefined || !payload || payload.plotScore === null) return <g key={`${cx}-${cy}`} />;
              return <circle key={payload.day} cx={cx} cy={cy} r={4} fill={COLOR[payload.verdict]} stroke="#fff" strokeWidth={1.5} />;
            }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
