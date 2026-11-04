"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScreenDrop, ScreenFlowPoint } from "@/lib/screenFlow";
import { fmtNum, fmtPct } from "@/lib/format";

const MAIN = "#433f4f";
const MILESTONE = "#ffc743";
const SIDE = "#d0cdd7";

const colorOf = (p: ScreenFlowPoint) => (p.side ? SIDE : p.milestone ? MILESTONE : MAIN);
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);
const pctOf = (v: number) => Math.round(v * 1000) / 10;

function ScreenTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScreenFlowPoint }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
      <div className="font-semibold">{p.label}</div>
      <div className="mt-1">
        {fmtNum(p.users)} чел. · {fmtPct(p.fromStart)} от первого экрана
      </div>
      {p.fromPrev !== null && <div className="mt-0.5 text-muted">{fmtPct(p.fromPrev)} от предыдущего</div>}
      {p.side && <div className="mt-0.5 text-muted">экран ошибки или побочной ветки</div>}
    </div>
  );
}

const Swatch = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
);

export function ScreenFlowChart({ points, drop }: { points: ScreenFlowPoint[]; drop: ScreenDrop | null }) {
  const data = points.map((p) => ({ ...p, pct: pctOf(p.fromStart) }));
  const yMax = Math.max(100, Math.ceil(Math.max(...data.map((d) => d.pct)) / 25) * 25);
  const hasSide = points.some((p) => p.side);
  const hasMilestone = points.some((p) => p.milestone);

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="kicker">Все экраны · PostHog</div>
          <h3 className="text-base font-bold">Прохождение экранов</h3>
        </div>
        <div className="text-xs text-muted">{points.length} экранов · % от первого экрана</div>
      </div>
      {drop && (
        <p className="mt-1 text-xs">
          До пэйвола больше всего людей теряется на переходе{" "}
          <span className="font-semibold">
            {drop.from} → {drop.to}
          </span>
          : {fmtNum(drop.lost)} из {fmtNum(drop.fromUsers)} чел.
        </p>
      )}

      <div className="scrollbar-thin mt-3 overflow-x-auto overflow-y-hidden">
        <div className="h-80" style={{ minWidth: points.length * 15 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke="#eae7ec" vertical={false} />
              <XAxis dataKey="label" interval={0} angle={-55} textAnchor="end" height={96} tickFormatter={short} tick={{ fontSize: 10, fill: "#65636d" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, yMax]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#65636d" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<ScreenTooltip />} cursor={{ fill: "#f2eff3" }} />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.key} fill={colorOf(d)} />
                ))}
                <LabelList
                  dataKey="pct"
                  content={(props) => {
                    const { x, y, width, index } = props as { x: number; y: number; width: number; index: number };
                    const d = data[index];
                    if (!d || !(index === 0 || d.milestone)) return null;
                    return (
                      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fontWeight={600} fill="#140f23">
                        {Math.round(d.pct)}%
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <Swatch color={MAIN} label="экран" />
        {hasMilestone && <Swatch color={MILESTONE} label="ключевая точка" />}
        {hasSide && <Swatch color={SIDE} label="ошибки и ветки" />}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">Считаем людей за период, как в воронке выше. Столбец бывает выше предыдущего: часть людей начала раньше периода и вернулась на этот экран.</p>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-semibold text-muted hover:text-ink">Таблица экранов</summary>
        <div className="scrollbar-thin mt-2 overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Экран</th>
                <th className="text-right">Людей</th>
                <th className="text-right">От первого</th>
                <th className="text-right">От предыдущего</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key}>
                  <td className={p.side ? "text-muted" : p.milestone ? "font-semibold" : ""}>{p.label}</td>
                  <td className="text-right tabular-nums">{fmtNum(p.users)}</td>
                  <td className="text-right tabular-nums">{fmtPct(p.fromStart)}</td>
                  <td className="text-right tabular-nums">{p.fromPrev === null ? "—" : fmtPct(p.fromPrev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
