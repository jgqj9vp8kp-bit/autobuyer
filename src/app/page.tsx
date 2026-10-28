import { Suspense } from "react";
import { CampaignTable } from "@/components/CampaignTable";
import { DateRange } from "@/components/DateRange";
import { ProductSwitch } from "@/components/ProductSwitch";
import { SourcesBar } from "@/components/SourcesBar";
import { KpiTile } from "@/components/ui";
import { defaultRange, evaluateCached } from "@/lib/evaluate";
import { fmtMoney, fmtNum } from "@/lib/format";
import { isProductKey, PRODUCT_KEYS, PRODUCT_LABEL } from "@/lib/products";
import type { ProductKey } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Promise<{ from?: string; to?: string; r?: string; product?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.dateFrom;
  const to = sp.to ?? def.dateTo;
  const product: ProductKey | null = isProductKey(sp.product) ? sp.product : null;
  const data = await evaluateCached(from, to, Boolean(sp.r));

  const all = data.campaigns;
  const rows = product ? all.filter((r) => r.product === product) : all;
  const counts: Partial<Record<ProductKey | "all", number>> = { all: all.length };
  for (const k of PRODUCT_KEYS) counts[k] = all.filter((r) => r.product === k).length;

  const spend = rows.reduce((s, r) => s + r.ad.spend, 0);
  const trials = rows.reduce((s, r) => s + r.ad.purchases, 0);
  const visitors = rows.reduce((s, r) => s + r.funnel.visitors, 0);
  const scored = rows.filter((r) => r.score.grade !== "N/A" && r.score.verdict !== "NO_DATA");
  const scoredSpend = scored.reduce((s, r) => s + r.ad.spend, 0);
  // Взвешиваем по расходу; если расхода нет (PostHog-only) — по визитам
  const weightOf = (r: (typeof rows)[number]) => (scoredSpend > 0 ? r.ad.spend : r.funnel.visitors);
  const totalWeight = scored.reduce((s, r) => s + weightOf(r), 0);
  const avgScore = totalWeight > 0 ? Math.round(scored.reduce((s, r) => s + r.score.score * weightOf(r), 0) / totalWeight) : 0;
  const byVerdict = (v: string) => rows.filter((r) => r.score.verdict === v);
  const scaleSpend = byVerdict("SCALE").reduce((s, r) => s + r.ad.spend, 0);
  const pauseSpend = byVerdict("PAUSE").reduce((s, r) => s + r.ad.spend, 0);
  const linkQuery = `from=${from}&to=${to}${product ? `&product=${product}` : ""}`;

  return (
    <div className="fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Autobuyer · AI-оценка кампаний</div>
          <h1 className="mt-1 text-3xl font-bold">Кампании Facebook{product ? ` · ${PRODUCT_LABEL[product]}` : ""}</h1>
          <div className="mt-2">
            <SourcesBar data={data} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Suspense>
            <ProductSwitch value={product} counts={counts} />
          </Suspense>
          <Suspense>
            <DateRange from={from} to={to} />
          </Suspense>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile tone="accent" label={scoredSpend > 0 ? "средний скор (взвешен по расходу)" : "средний скор (взвешен по визитам)"} value={avgScore} sub={`${scored.length} из ${rows.length} кампаний с вердиктом`} />
        <KpiTile label="расход за период" value={spend > 0 ? fmtMoney(spend) : "—"} sub={`${fmtNum(visitors)} визитов`} />
        <KpiTile label="триалов" value={fmtNum(trials)} sub={`CPA ${fmtMoney(trials && spend > 0 ? spend / trials : null, 2)}`} />
        <KpiTile tone="dark" label="масштабировать" value={byVerdict("SCALE").length} sub={`${fmtMoney(scaleSpend)} расхода`} />
        <KpiTile label="оптимизировать" value={byVerdict("OPTIMIZE").length} sub={`${fmtMoney(byVerdict("OPTIMIZE").reduce((s, r) => s + r.ad.spend, 0))} расхода`} />
        <KpiTile label="остановить" value={byVerdict("PAUSE").length} sub={`${fmtMoney(pauseSpend)} под риском`} />
      </section>

      <CampaignTable rows={rows} linkQuery={linkQuery} />

      <p className="text-xs text-muted">
        Период {from} — {to}. Пересчитано {new Date(data.generatedAt).toLocaleTimeString("ru-RU")}. Скор = сумма баллов по включённым критериям / максимум; пороги настраиваются в разделе «Правила» отдельно для каждого
        продукта.
      </p>
    </div>
  );
}
