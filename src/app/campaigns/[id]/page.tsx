import Link from "next/link";
import { ArrowLeft, Lightbulb, Wrench } from "lucide-react";
import { CriteriaBreakdown } from "@/components/CriteriaBreakdown";
import { DailyChart } from "@/components/DailyChart";
import { DateRange } from "@/components/DateRange";
import { FunnelBars } from "@/components/FunnelBars";
import { ScoreRing } from "@/components/ScoreRing";
import { ScoreHistoryChart } from "@/components/ScoreHistoryChart";
import { Card, Kicker, VerdictPill } from "@/components/ui";
import { loadConfig } from "@/lib/configStore";
import { defaultRange, evaluateCached } from "@/lib/evaluate";
import { bucketCpa } from "@/lib/benchmarks";
import { CHANNEL_LABEL } from "@/lib/channels";
import { addDaysIso, fmtDate, fmtMoney, fmtNum, fmtPct, fmtStatus } from "@/lib/format";
import { scoreHistoryCached } from "@/lib/history";
import { DEFAULT_PRODUCT, PRODUCT_LABEL, PRODUCT_SOURCE_LABEL } from "@/lib/products";
import { VERDICT_META } from "@/lib/verdict";
import clsx from "clsx";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
// Vercel: запросы к дашборду и PostHog (60-дневные бенчмарки) могут занимать больше 10 с по умолчанию
export const maxDuration = 60;

const HISTORY_PRESETS = [14, 30, 60, 90];

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function NotFoundInRange({ id, from, to }: { id: string; from: string; to: string }) {
  const wideFrom = addDaysIso(to, -59);
  return (
    <div className="card mx-auto mt-20 max-w-md p-8 text-center">
      <div className="kicker">Нет данных</div>
      <h1 className="mt-1 text-2xl font-bold">Кампания {id} не найдена</h1>
      <p className="mt-2 text-sm text-muted">
        Ни в периоде {from} — {to}, ни за последние 30 дней по ней нет событий воронки и статистики.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href={`/campaigns/${encodeURIComponent(id)}?from=${wideFrom}&to=${to}`} className="btn btn-ghost">
          Посмотреть за 60 дней
        </Link>
        <Link href={`/?from=${from}&to=${to}`} className="btn btn-dark">
          К списку кампаний
        </Link>
      </div>
    </div>
  );
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; r?: string; hist?: string; product?: string; channel?: string }>;
}) {
  const { id: rawId } = await params;
  // id кампании может содержать пробелы (TikTok: "BR_hand_1-5 PR") — в params он приходит закодированным
  const id = safeDecode(rawId);
  const sp = await searchParams;
  const def = defaultRange();
  const requestedFrom = sp.from ?? def.dateFrom;
  const to = sp.to ?? def.dateTo;
  let from = requestedFrom;
  // Окно истории по умолчанию — ближайший пресет, покрывающий выбранный период
  const rangeDays = Math.round((new Date(to).getTime() - new Date(requestedFrom).getTime()) / 86400000) + 1;
  const defaultHist = HISTORY_PRESETS.find((d) => d >= rangeDays) ?? HISTORY_PRESETS[HISTORY_PRESETS.length - 1];
  const histDays = HISTORY_PRESETS.includes(Number(sp.hist)) ? Number(sp.hist) : defaultHist;
  const data = await evaluateCached(from, to, Boolean(sp.r));
  let row = data.campaigns.find((c) => c.ad.campaignId === id);
  let rangeNote: string | null = null;
  if (!row) {
    // В выбранном периоде кампании нет (не крутилась или период короткий) — пробуем последние 30 дней
    const wideFrom = addDaysIso(to, -29);
    if (wideFrom < from) {
      row = (await evaluateCached(wideFrom, to)).campaigns.find((c) => c.ad.campaignId === id);
      if (row) {
        rangeNote = `За ${requestedFrom} — ${to} по этой кампании нет данных, показан период ${wideFrom} — ${to}.`;
        from = wideFrom;
      }
    }
  }
  if (!row) return <NotFoundInRange id={id} from={requestedFrom} to={to} />;
  const { ad, funnel, score, product, productSource } = row;
  const segment = row.segment ?? null;
  const es = { maxAgeDays: 3 };
  const meta = VERDICT_META[score.verdict];
  const [history, cfg] = await Promise.all([scoreHistoryCached(ad, to, histDays, 7, product), loadConfig(product ?? DEFAULT_PRODUCT)]);
  const backQuery = `from=${from}&to=${to}&channel=${sp.channel ?? row.channel}${sp.product ? `&product=${sp.product}` : ""}`;
  const scored = history.points.filter((p) => p.verdict !== "NO_DATA");
  const first = scored[0];
  const last = scored[scored.length - 1];
  const delta = first && last && first !== last ? last.score - first.score : null;
  const histQuery = (d: number) => `?from=${from}&to=${to}&hist=${d}`;

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
        <Link href={`/?${backQuery}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft size={14} /> Все кампании
        </Link>
        <Suspense>
          <DateRange from={from} to={to} />
        </Suspense>
      </div>

      {rangeNote && <div className="rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink">{rangeNote}</div>}

      <Card className="flex flex-wrap items-center gap-6">
        <ScoreRing score={score.score} grade={score.grade} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictPill verdict={score.verdict} />
            <span className="text-xs text-muted">{meta.hint}</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold leading-tight">{ad.campaignName}</h1>
          <div className="mt-1 text-xs text-muted">
            <span className="font-semibold text-ink" title={`Продукт ${PRODUCT_SOURCE_LABEL[productSource]}${product ? "" : `; правила ${PRODUCT_LABEL[DEFAULT_PRODUCT]}`}`}>
              {product ? PRODUCT_LABEL[product] : "продукт не определён"}
            </span>{" "}
            · {CHANNEL_LABEL[row.channel]} · {ad.campaignId} · {ad.buyer ?? "—"} · {ad.geo ?? "—"} · {ad.accountName ?? ad.accountId ?? ""} · {fmtStatus(ad)}
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
          {stat("Расход", ad.statsSource === "posthog" ? "—" : fmtMoney(ad.spend), ad.statsSource === "posthog" ? `нет в дашборде · ${ad.trafficSource ?? "источник неизвестен"}` : undefined)}
          {stat("Триалы", fmtNum(ad.purchases), `CPA ${fmtMoney(ad.cpa, 2)}`)}
          {stat("Визиты", fmtNum(funnel.visitors), `CTR ${ad.ctr.toFixed(2)}%`)}
          {stat("ROAS", ad.roas ? `${ad.roas.toFixed(2)}x` : "—", `выручка ${fmtMoney(ad.revenue)}`)}
        </div>
      </Card>

      {segment && (
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <Kicker>
                Сегмент · {segment.benchmarkLevel === "segment" ? "продукт × гео по таргетингу" : segment.benchmarkLevel === "product" ? "по продукту (в этом гео мало данных)" : segment.benchmarkLevel === "all" ? "все кампании (мало данных)" : "бенчмарка нет"} · 60 дн.
              </Kicker>
              <h2 className="text-lg font-bold">{segment.label}</h2>
              <p className="mt-1 text-xs text-muted">
                {segment.ageDays === null
                  ? "Дата запуска неизвестна: кампании нет в дневной статистике за 60 дней."
                  : segment.ageDays >= 999
                    ? "Кампания стартовала раньше окна наблюдения, считается зрелой."
                    : `Кампания на дне ${segment.ageDays} (первая открутка ${segment.firstDeliveryDate ? fmtDate(segment.firstDeliveryDate) : "—"}).`}
                {segment.earlyNormCpa && segment.earlyNormCpa > (cfg.targetCpa ?? 0)
                  ? ` CPA оценивается относительно нормы дня ${segment.ageDays} в сегменте (${fmtMoney(segment.earlyNormCpa, 2)}), «остановить» не выносится.`
                  : segment.earlyStage
                    ? " Сегмент здоровый: на ранней стадии «остановить» не выносится."
                    : segment.ageDays !== null && segment.ageDays <= (cfg.earlyStage?.maxAgeDays ?? es.maxAgeDays) && segment.benchmark
                      ? " Сегмент исторически дорогой, поблажки для старта нет."
                      : ""}
              </p>
            </div>
            <Link href={`/benchmarks${product ? `?product=${product}` : ""}`} className="btn btn-ghost">
              Все сегменты
            </Link>
          </div>
          {segment.benchmark ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {stat("Зрелый CPA (день 4+)", fmtMoney(bucketCpa(segment.benchmark.days.mature), 2), `${fmtNum(segment.benchmark.days.mature.trials)} триалов · цель ${fmtMoney(cfg.targetCpa)}`)}
              {stat("Норма дня 1", fmtMoney(bucketCpa(segment.benchmark.days.d1), 2), `${segment.benchmark.days.d1.campaigns} кампаний`)}
              {stat("Норма дня 2", fmtMoney(bucketCpa(segment.benchmark.days.d2), 2), `${segment.benchmark.days.d2.campaigns} кампаний`)}
              {stat("Норма дня 3", fmtMoney(bucketCpa(segment.benchmark.days.d3), 2), `${segment.benchmark.days.d3.campaigns} кампаний`)}
              {stat(
                "Дорогой старт",
                segment.benchmark.recovery.recovered + segment.benchmark.recovery.stayedBad ? `${segment.benchmark.recovery.recovered} из ${segment.benchmark.recovery.recovered + segment.benchmark.recovery.stayedBad}` : "—",
                "вышли на норму к дню 3+",
              )}
            </div>
          ) : (
            <div className="text-sm text-muted">Для этого сегмента пока слишком мало данных за 60 дней, нормы не считаются.</div>
          )}
        </Card>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Kicker>Динамика · скользящее окно {history.windowDays} дн.</Kicker>
            <h2 className="text-lg font-bold">Как менялся скор</h2>
            <p className="mt-1 text-xs text-muted">
              Точка на дату = скор по данным за {history.windowDays} дней до неё включительно. Пунктир — границы вердиктов, визиты и триалы — в подсказке при наведении.
              {history.source === "demo" && " Демо-данные."}
              {history.note && ` ${history.note}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {delta !== null && (
              <div className={clsx("rounded-full px-3 py-1 text-xs font-semibold", delta > 0 ? "bg-success-soft text-success" : delta < 0 ? "bg-danger-soft text-danger" : "bg-subtle text-muted")}>
                {delta > 0 ? "+" : ""}
                {delta} за {histDays} дн.
              </div>
            )}
            <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
              {HISTORY_PRESETS.map((d) => (
                <Link key={d} href={histQuery(d)} className={clsx("rounded-full px-3 py-1 text-xs font-semibold", d === histDays ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink")}>
                  {d} дн.
                </Link>
              ))}
            </div>
          </div>
        </div>
        {scored.length ? (
          <ScoreHistoryChart points={history.points} thresholds={cfg.verdicts} />
        ) : (
          <div className="py-10 text-center text-sm text-muted">За выбранный период ни в одном окне не набралось данных для оценки.</div>
        )}
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
