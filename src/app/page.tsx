import { Suspense } from "react";
import { CampaignTable } from "@/components/CampaignTable";
import { ChannelSwitch } from "@/components/ChannelSwitch";
import { DateRange } from "@/components/DateRange";
import { ProductSwitch } from "@/components/ProductSwitch";
import { SourcesBar } from "@/components/SourcesBar";
import { KpiTile } from "@/components/ui";
import { CHANNEL_KEYS, CHANNEL_LABEL, DEFAULT_CHANNEL, isChannel } from "@/lib/channels";
import { defaultRange, evaluateCached } from "@/lib/evaluate";
import { fmtMoney, fmtNum } from "@/lib/format";
import { isProductKey, PRODUCT_KEYS, PRODUCT_LABEL } from "@/lib/products";
import type { Channel, ProductKey } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = Promise<{ from?: string; to?: string; r?: string; product?: string; channel?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.dateFrom;
  const to = sp.to ?? def.dateTo;
  const product: ProductKey | null = isProductKey(sp.product) ? sp.product : null;
  const channel: Channel = isChannel(sp.channel) ? sp.channel : DEFAULT_CHANNEL;
  const data = await evaluateCached(from, to, Boolean(sp.r));

  // Каналы не смешиваем: сначала режем по каналу, продуктовый переключатель считает уже внутри канала
  const everything = data.campaigns;
  const inChannel = everything.filter((r) => r.channel === channel);
  const rows = product ? inChannel.filter((r) => r.product === product) : inChannel;
  const counts: Partial<Record<ProductKey | "all", number>> = { all: inChannel.length };
  for (const k of PRODUCT_KEYS) counts[k] = inChannel.filter((r) => r.product === k).length;
  const channelCounts: Partial<Record<Channel, number>> = {};
  for (const k of CHANNEL_KEYS) channelCounts[k] = everything.filter((r) => r.channel === k && (!product || r.product === product)).length;

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
  const linkQuery = `from=${from}&to=${to}&channel=${channel}${product ? `&product=${product}` : ""}`;

  return (
    <div className="fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Autobuyer · AI-оценка кампаний</div>
          <h1 className="mt-1 text-3xl font-bold">
            Кампании {CHANNEL_LABEL[channel]}
            {product ? ` · ${PRODUCT_LABEL[product]}` : ""}
          </h1>
          <div className="mt-2">
            <SourcesBar data={data} />
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Suspense>
              <ChannelSwitch value={channel} counts={channelCounts} />
            </Suspense>
            <Suspense>
              <ProductSwitch value={product} counts={counts} />
            </Suspense>
          </div>
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
        продукта. {channel === "facebook" ? "Расход и CPA — из FB-дашборда." : `Канал ${CHANNEL_LABEL[channel]} известен только по воронке PostHog: расхода и CPA нет, оценка по конверсиям.`}
      </p>
    </div>
  );
}
