import { Suspense } from "react";
import clsx from "clsx";
import { FunnelSwitch } from "@/components/FunnelSwitch";
import { ProductSwitch } from "@/components/ProductSwitch";
import { Card, Kicker } from "@/components/ui";
import { BENCHMARK_WINDOW_DAYS, bucketCpa, getBenchmarks, segmentKey, segmentLabel } from "@/lib/benchmarks";
import { loadAllConfigs } from "@/lib/configStore";
import { defaultRange, isLiveMode, sourcesConfig } from "@/lib/evaluate";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { funnelTitle, NO_FUNNEL, parseFunnelParam, type FunnelOption } from "@/lib/funnels";
import { DEFAULT_PRODUCT, isProductKey, PRODUCT_KEYS } from "@/lib/products";
import type { DayBucket, ProductKey, SegmentBenchmark } from "@/lib/types";

export const dynamic = "force-dynamic";
// Vercel: запросы к дашборду и PostHog (60-дневные бенчмарки) могут занимать больше 10 с по умолчанию
export const maxDuration = 60;

export default async function BenchmarksPage({ searchParams }: { searchParams: Promise<{ product?: string; to?: string; funnel?: string }> }) {
  const sp = await searchParams;
  const product: ProductKey | null = isProductKey(sp.product) ? sp.product : null;
  const to = sp.to ?? defaultRange().dateTo;
  const configs = await loadAllConfigs();
  const src = sourcesConfig();
  const set = isLiveMode() && src.capsuled ? await getBenchmarks({ capsuled: src.capsuled, posthog: src.posthog }, to, (p) => configs[p ?? DEFAULT_PRODUCT].targetCpa).catch(() => null) : null;

  const funnel = parseFunnelParam(sp.funnel);
  // С выбранной воронкой — сегменты, посчитанные только по её кампаниям
  const source = !set ? {} : funnel ? (set.funnels?.[funnel]?.segments ?? {}) : set.segments;
  const all = Object.values(source).filter((g) => g.geo !== "*" && g.spend >= 50);
  const totalKey = product ? segmentKey(product, "*") : "*|*";
  const funnelOpts: FunnelOption[] = Object.entries(set?.funnels ?? {})
    .map(([key, f]) => ({ key, count: f.segments[totalKey]?.campaigns ?? 0, spend: f.segments[totalKey]?.spend ?? 0 }))
    .filter((o) => o.count > 0 || o.key === funnel)
    .sort((a, b) => Number(a.key === NO_FUNNEL) - Number(b.key === NO_FUNNEL) || b.spend - a.spend);
  if (funnel && !funnelOpts.some((o) => o.key === funnel)) funnelOpts.push({ key: funnel, count: 0, spend: 0 });
  // Кампании с откруткой в окне (как в сегментах и в списке воронок)
  const shownCampaigns = funnel ? (set?.funnels?.[funnel]?.campaigns ?? 0) : (set?.segments["*|*"]?.campaigns ?? 0);
  const rows = (product ? all.filter((g) => g.product === product) : all).sort((a, b) => b.spend - a.spend);
  const counts: Partial<Record<ProductKey | "all", number>> = { all: all.length };
  for (const k of PRODUCT_KEYS) counts[k] = all.filter((g) => g.product === k).length;
  const targetOf = (g: SegmentBenchmark) => configs[g.product ?? DEFAULT_PRODUCT].targetCpa;

  const cell = (b: DayBucket) => {
    const v = bucketCpa(b);
    return v === null ? (b.spend > 0 ? `—($${b.spend.toFixed(0)})` : "—") : fmtMoney(v, 0);
  };
  const matureClass = (g: SegmentBenchmark) => {
    const m = bucketCpa(g.days.mature);
    if (m === null) return "text-muted";
    const t = targetOf(g);
    return m <= t ? "text-success" : m > 1.5 * t ? "text-danger" : "text-warn";
  };
  const startClass = (g: SegmentBenchmark) => {
    const d1 = bucketCpa(g.days.d1);
    const m = bucketCpa(g.days.mature);
    if (d1 === null || m === null) return "";
    return d1 / m >= 1.5 ? "font-semibold text-warn" : "";
  };

  return (
    <div className="fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Стоимость триала по сегментам</div>
          <h1 className="mt-1 text-3xl font-bold">
            Сегменты{product ? ` · ${segmentLabel(product, "*").replace(" × все гео", "")}` : ""}
            {funnel ? ` · ${funnelTitle(funnel)}` : ""}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Продукт × гео по таргетингу, окно {BENCHMARK_WINDOW_DAYS} дней до {fmtDate(to)}. «День 1/2/3» — CPA кампаний сегмента в их первый, второй и третий день открутки; «зрелый» — день 4+ и кампании, стартовавшие до
            окна. По этим нормам молодые кампании в здоровых сегментах получают поблажку в скоринге (настройка «Ранняя стадия» в «Правилах»).
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-col items-end gap-2">
          <Suspense>
            <ProductSwitch value={product} counts={counts} />
          </Suspense>
          {set && (
            <Suspense>
              <FunnelSwitch value={funnel} options={funnelOpts} total={set.segments[totalKey]?.campaigns ?? 0} unit="камп." />
            </Suspense>
          )}
        </div>
      </header>

      {!set ? (
        <Card>
          <div className="text-sm text-muted">Бенчмарки считаются только в live-режиме по данным дашборда баеров. Проверьте раздел «Источники».</div>
        </Card>
      ) : (
        <Card className="overflow-hidden !p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <Kicker>
              {shownCampaigns} кампаний · {all.length} сегментов с расходом от $50 · пересчитано {new Date(set.computedAt).toLocaleTimeString("ru-RU")}
            </Kicker>
            <div className="text-xs text-muted">
              <span className="text-success">зелёный</span> — зрелый CPA в цели, <span className="text-danger">красный</span> — дороже цели в 1.5 раза; <span className="font-semibold text-warn">выделен день 1</span>, если он в 1.5 раза дороже зрелого
            </div>
          </div>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Сегмент</th>
                  <th className="text-right">Кампаний</th>
                  <th className="text-right">Расход</th>
                  <th className="text-right">Триалы</th>
                  <th className="text-right">CPA</th>
                  <th className="text-right">Цель</th>
                  <th className="text-right">День 1</th>
                  <th className="text-right">День 2</th>
                  <th className="text-right">День 3</th>
                  <th className="text-right">Зрелый (4+)</th>
                  <th className="text-right">Дорогой старт</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const rec = g.recovery.recovered + g.recovery.stayedBad;
                  return (
                    <tr key={g.key}>
                      <td className="font-semibold">{segmentLabel(g.product, g.geo)}</td>
                      <td className="text-right tabular-nums">
                        {g.campaigns} <span className="text-muted">({g.launched} новых)</span>
                      </td>
                      <td className="text-right tabular-nums">{fmtMoney(g.spend)}</td>
                      <td className="text-right tabular-nums">{fmtNum(g.trials)}</td>
                      <td className="text-right tabular-nums">{fmtMoney(g.cpa, 1)}</td>
                      <td className="text-right tabular-nums text-muted">{fmtMoney(targetOf(g))}</td>
                      <td className={clsx("text-right tabular-nums", startClass(g))}>{cell(g.days.d1)}</td>
                      <td className="text-right tabular-nums">{cell(g.days.d2)}</td>
                      <td className="text-right tabular-nums">{cell(g.days.d3)}</td>
                      <td className={clsx("text-right font-semibold tabular-nums", matureClass(g))}>{cell(g.days.mature)}</td>
                      <td className="text-right tabular-nums" title="кампании с дорогим первым днём: сколько вышли на норму к дню 3+">
                        {rec ? `${g.recovery.recovered} из ${rec}` : "—"}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-sm text-muted">
                      Нет сегментов с расходом от $50
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
