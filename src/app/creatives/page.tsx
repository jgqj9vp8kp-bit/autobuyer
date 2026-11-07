import Link from "next/link";
import { Suspense } from "react";
import { CreativeTable } from "@/components/CreativeTable";
import { DateRange } from "@/components/DateRange";
import { FunnelSwitch } from "@/components/FunnelSwitch";
import { ProductSwitch } from "@/components/ProductSwitch";
import { KpiTile } from "@/components/ui";
import { evaluateCreatives } from "@/lib/creatives";
import { defaultRange } from "@/lib/evaluate";
import { fmtMoney, fmtNum } from "@/lib/format";
import { funnelOptions, funnelTitle, matchesFunnel, parseFunnelParam } from "@/lib/funnels";
import { isProductKey, PRODUCT_KEYS, PRODUCT_LABEL } from "@/lib/products";
import type { ProductKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = Promise<{ from?: string; to?: string; r?: string; product?: string; campaign?: string; funnel?: string }>;

export default async function CreativesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.dateFrom;
  const to = sp.to ?? def.dateTo;
  const product: ProductKey | null = isProductKey(sp.product) ? sp.product : null;
  const funnel = sp.campaign ? null : parseFunnelParam(sp.funnel);
  const report = await evaluateCreatives(from, to, { campaignId: sp.campaign, force: Boolean(sp.r) });

  const all = report.creatives;
  const inProduct = product ? all.filter((c) => c.product === product) : all;
  const funnelOpts = funnelOptions(inProduct, (c) => c.funnelAlias, (c) => c.ad.spend, funnel);
  const rows = inProduct.filter((c) => matchesFunnel(c.funnelAlias, funnel));
  const counts: Partial<Record<ProductKey | "all", number>> = { all: all.length };
  for (const k of PRODUCT_KEYS) counts[k] = all.filter((c) => c.product === k).length;

  const spend = rows.reduce((s, c) => s + c.ad.spend, 0);
  const trials = rows.reduce((s, c) => s + c.ad.purchases, 0);
  const visitors = rows.reduce((s, c) => s + c.funnel.visitors, 0);
  const active = rows.filter((c) => c.ad.status === "ACTIVE").length;
  const byVerdict = (v: string) => rows.filter((c) => c.score.verdict === v);
  const unmapped = report.coverage?.unmappedSpend ?? 0;
  const linkQuery = `from=${from}&to=${to}${funnel ? `&funnel=${funnel}` : ""}`;

  return (
    <div className="fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="kicker">Facebook · воронка по id объявления</div>
          <h1 className="mt-1 text-3xl font-bold">
            Креативы{product ? ` · ${PRODUCT_LABEL[product]}` : ""}
            {funnel ? ` · ${funnelTitle(funnel)}` : ""}
          </h1>
          {sp.campaign && (
            <p className="mt-2 text-sm text-muted">
              Только кампания <span className="font-semibold text-ink">{report.campaignName ?? sp.campaign}</span> ·{" "}
              <Link href={`/creatives?${linkQuery}`} className="underline hover:text-ink">
                показать все
              </Link>
            </p>
          )}
        </div>
        <div className="flex min-w-0 max-w-full flex-col items-end gap-2">
          {!sp.campaign && (
            <Suspense>
              <ProductSwitch value={product} counts={counts} />
            </Suspense>
          )}
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            {!sp.campaign && (
              <Suspense>
                <FunnelSwitch value={funnel} options={funnelOpts} total={inProduct.length} unit="креат." />
              </Suspense>
            )}
            <Suspense>
              <DateRange from={from} to={to} />
            </Suspense>
          </div>
        </div>
      </header>

      {report.message && <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">{report.message}</div>}
      {unmapped > 0 && !sp.campaign && (
        <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">
          {fmtMoney(unmapped)} расхода за период не привязаны к креативам: полные данные о креативах дашборд отдаёт только за последние недели. Эти объявления в таблицу не попали.
        </div>
      )}
      {report.truncated && <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">Ответ дашборда усечён лимитом строк: сузьте период, иначе часть креативов не попадёт в таблицу.</div>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile tone="accent" label="креативов" value={fmtNum(rows.length)} sub={`${fmtNum(active)} крутятся сейчас`} />
        <KpiTile label="расход за период" value={fmtMoney(spend)} sub={`${fmtNum(visitors)} визитов`} />
        <KpiTile label="триалов" value={fmtNum(trials)} sub={`CPA ${fmtMoney(trials && spend > 0 ? spend / trials : null, 2)}`} />
        <KpiTile tone="dark" label="масштабировать" value={byVerdict("SCALE").length} sub={`${fmtMoney(byVerdict("SCALE").reduce((s, c) => s + c.ad.spend, 0))} расхода`} />
        <KpiTile label="остановить" value={byVerdict("PAUSE").length} sub={`${fmtMoney(byVerdict("PAUSE").reduce((s, c) => s + c.ad.spend, 0))} под риском`} />
      </section>

      <CreativeTable rows={rows} linkQuery={linkQuery} />

      <p className="text-xs text-muted">
        Период {from} — {to}. Одинаковые визуалы под разными id склеены. Триалы и воронка — из PostHog по id объявления, скор — по правилам продукта. Ссылки на превью временные, они обновляются при каждой загрузке.
      </p>
    </div>
  );
}
