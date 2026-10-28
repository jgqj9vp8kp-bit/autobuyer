"use client";

import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScorePoint } from "@/lib/history";
import { fmtDate, fmtNum } from "@/lib/format";
import { VERDICT_META } from "@/lib/verdict";

const COLOR: Record<string, string> = { SCALE: "#1f9d5a", KEEP: "#ffc743", OPTIMIZE: "#d98a00", PAUSE: "#d93a3a", NO_DATA: "#d0cdd7" };

type Point = ScorePoint & { label: string; plotScore: number | null };

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
      <div className="font-semibold">{p.label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLOR[p.verdict] }} />
        {p.verdict === "NO_DATA" ? "нет данных для оценки" : `Скор ${p.score} · ${VERDICT_META[p.verdict].label}`}
      </div>
      <div className="mt-0.5 text-muted">
        визитов {fmtNum(p.visitors)} · триалов {fmtNum(p.trials)}
      </div>
    </div>
  );
}

export function ScoreHistoryChart({ points, thresholds }: { points: ScorePoint[]; thresholds: { scale: number; keep: number; optimize: number } }) {
  const data: Point[] = points.map((p) => ({ ...p, label: fmtDate(p.day), plotScore: p.verdict === "NO_DATA" ? null : p.score }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffe16b" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#ffe16b" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eae7ec" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} width={32} />
          <ReferenceLine y={thresholds.scale} stroke="#1f9d5a" strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={thresholds.keep} stroke="#ffc743" strokeDasharray="4 4" strokeOpacity={0.8} />
          <ReferenceLine y={thresholds.optimize} stroke="#d93a3a" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip content={<HistoryTooltip />} cursor={{ stroke: "#eae7ec" }} />
          <Area
            type="monotone"
            dataKey="plotScore"
            stroke="#140f23"
            strokeWidth={2}
            fill="url(#scoreFill)"
            connectNulls={false}
            dot={(props: { cx?: number; cy?: number; payload?: Point }) => {
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
