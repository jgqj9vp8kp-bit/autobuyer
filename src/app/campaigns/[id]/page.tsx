import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb, Wrench } from "lucide-react";
import { CriteriaBreakdown } from "@/components/CriteriaBreakdown";
import { DailyChart } from "@/components/DailyChart";
import { DateRange } from "@/components/DateRange";
import { FunnelBars } from "@/components/FunnelBars";
import { ScoreRing } from "@/components/ScoreRing";
import { Card, Kicker, VerdictPill } from "@/components/ui";
import { defaultRange, evaluateCached } from "@/lib/evaluate";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { VERDICT_META } from "@/lib/verdict";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; r?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.dateFrom;
  const to = sp.to ?? def.dateTo;
  const data = await evaluateCached(from, to, Boolean(sp.r));
  const row = data.campaigns.find((c) => c.ad.campaignId === id);
  if (!row) notFound();
  const { ad, funnel, score } = row;
  const meta = VERDICT_META[score.verdict];

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-2xl bg-subtle p-4">
      <div className="kicker">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );

  return (
    <div className="fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/?from=${from}&to=${to}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Все кампании
        </Link>
        <Suspense>
          <DateRange from={from} to={to} />
        </Suspense>
      </div>

      <Card className="flex flex-wrap items-center gap-6">
        <ScoreRing score={score.score} grade={score.grade} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictPill verdict={score.verdict} />
            <span className="text-xs text-muted">{meta.hint}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">{ad.campaignName}</h1>
          <div className="mt-1 text-xs text-muted">
            {ad.campaignId} · {ad.buyer ?? "—"} · {ad.geo ?? "—"} · {ad.accountName ?? ad.accountId ?? ""} · {ad.status}
            {funnel.funnelAlias && (
              <>
                {" "}
                · воронка <span className="font-mono text-ink">{funnel.funnelAlias}</span>
              </>
            )}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {score.insights.map((t, i) => (
              <li key={i} className="flex gap-2">
                <Lightbulb size={14} className="mt-0.5 shrink-0 text-accent-deep" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
          {stat("Расход", fmtMoney(ad.spend))}
          {stat("Триалы", fmtNum(ad.purchases), `CPA ${fmtMoney(ad.cpa, 2)}`)}
          {stat("Визиты", fmtNum(funnel.visitors), `CTR ${ad.ctr.toFixed(2)}%`)}
          {stat("ROAS", ad.roas ? `${ad.roas.toFixed(2)}x` : "—", `выручка ${fmtMoney(ad.revenue)}`)}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <Kicker>Воронка продукта · PostHog</Kicker>
              <h2 className="text-lg font-bold">Как проходит аудитория</h2>
            </div>
            <div className="text-right text-xs text-muted">
              визит → триал <span className="font-semibold text-ink">{fmtPct(funnel.trialCr, 2)}</span>
            </div>
          </div>
          <FunnelBars funnel={funnel} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              ["CR 1-го экрана", fmtPct(funnel.firstScreenCr)],
              ["до пэйвола", fmtPct(funnel.paywallReach)],
              ["CR пэйвола", fmtPct(funnel.paywallCr)],
              ["апсейл 1 / 2", `${fmtPct(funnel.upsell1Cr)} / ${funnel.hasUpsell2 ? fmtPct(funnel.upsell2Cr) : "нет"}`],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-line p-2.5">
                <div className="text-muted">{l}</div>
                <div className="font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <Kicker>Скор-карта</Kicker>
            <h2 className="text-lg font-bold">
              {score.pointsEarned} из {score.pointsPossible} баллов
            </h2>
          </div>
          <CriteriaBreakdown criteria={score.criteria} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="mb-3">
            <Kicker>Динамика</Kicker>
            <h2 className="text-lg font-bold">Расход и CPA по дням</h2>
          </div>
          {ad.daily.length ? <DailyChart daily={ad.daily} /> : <div className="py-10 text-center text-sm text-muted">Нет дневной разбивки</div>}
        </Card>
        <Card className="bg-gradient-to-br from-accent-soft to-white">
          <div className="mb-3">
            <Kicker>Что делать</Kicker>
            <h2 className="text-lg font-bold">Рекомендации</h2>
          </div>
          {score.recommendations.length ? (
            <ul className="space-y-2 text-sm">
              {score.recommendations.map((t, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-white/80 p-3">
                  <Wrench size={14} className="mt-0.5 shrink-0 text-ink" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl bg-white/80 p-3 text-sm">Проблемных критериев нет. {score.verdict === "SCALE" ? "Повышайте бюджет шагами по 20–30% и следите за CPA." : "Продолжайте наблюдение."}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
