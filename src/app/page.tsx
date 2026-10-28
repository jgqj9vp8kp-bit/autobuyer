import { Suspense } from "react";
import { CampaignTable } from "@/components/CampaignTable";
import { DateRange } from "@/components/DateRange";
import { SourcesBar } from "@/components/SourcesBar";
import { KpiTile } from "@/components/ui";
import { defaultRange, evaluateCached } from "@/lib/evaluate";
import { fmtMoney, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = Promise<{ from?: string; to?: string; r?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.dateFrom;
  const to = sp.to ?? def.dateTo;
  const data = await evaluateCached(from, to, Boolean(sp.r));

  const rows = data.campaigns;
  const spend = rows.reduce((s, r) => s + r.ad.spend, 0);
  const trials = rows.reduce((s, r) => s + r.ad.purchases, 0);
  const visitors = rows.reduce((s, r) => s + r.funnel.visitors, 0);
  const scored = rows.filter((r) => r.score.grade !== "N/A");
  const avgScore = scored.length ? Math.round(scored.reduce((s, r) => s + r.score.score * r.ad.spend, 0) / Math.max(1, scored.reduce((s, r) => s + r.ad.spend, 0))) : 0;
  const byVerdict = (v: string) => rows.filter((r) => r.score.verdict === v);
  const scaleSpend = byVerdict("SCALE").reduce((s, r) => s + r.ad.spend, 0);
  const pauseSpend = byVerdict("PAUSE").reduce((s, r) => s + r.ad.spend, 0);

  return (
    <div className="fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Autobuyer · AI-оценка кампаний</div>
          <h1 className="mt-1 text-3xl font-bold">Кампании Facebook</h1>
          <div className="mt-2">
            <SourcesBar data={data} />
          </div>
        </div>
        <Suspense>
          <DateRange from={from} to={to} />
        </Suspense>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile tone="accent" label="средний скор (взвешен по расходу)" value={avgScore} sub={`${scored.length} из ${rows.length} кампаний оценены`} />
        <KpiTile label="расход за период" value={fmtMoney(spend)} sub={`${fmtNum(visitors)} визитов`} />
        <KpiTile label="триалов" value={fmtNum(trials)} sub={`CPA ${fmtMoney(trials ? spend / trials : null, 2)}`} />
        <KpiTile tone="dark" label="масштабировать" value={byVerdict("SCALE").length} sub={`${fmtMoney(scaleSpend)} расхода`} />
        <KpiTile label="оптимизировать" value={byVerdict("OPTIMIZE").length} sub={`${fmtMoney(byVerdict("OPTIMIZE").reduce((s, r) => s + r.ad.spend, 0))} расхода`} />
        <KpiTile label="остановить" value={byVerdict("PAUSE").length} sub={`${fmtMoney(pauseSpend)} под риском`} />
      </section>

      <CampaignTable rows={rows} />

      <p className="text-xs text-muted">
        Период {from} — {to}. Пересчитано {new Date(data.generatedAt).toLocaleTimeString("ru-RU")}. Скор = сумма баллов по включённым критериям / максимум; пороги настраиваются в разделе «Правила».
      </p>
    </div>
  );
}
