import type {
  AdCampaignStats,
  CampaignScore,
  CriterionResult,
  FunnelMetrics,
  MetricKey,
  ScoringConfig,
  ScoringCriterion,
  Verdict,
} from "@/lib/types";

/** Линейная интерполяция баллов по порогам. */
export function pointsForValue(bands: ScoringCriterion["bands"], value: number): number {
  const sorted = [...bands].sort((a, b) => a.value - b.value);
  if (sorted.length === 0) return 0;
  if (value <= sorted[0].value) return sorted[0].points;
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].points;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = (value - a.value) / (b.value - a.value || 1);
      return a.points + (b.points - a.points) * t;
    }
  }
  return 0;
}

/** Тренд CPA: среднее последних 3 дней против предыдущих 4 (относительное изменение). */
function cpaTrend(ad: AdCampaignStats): number | null {
  const days = [...ad.daily].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
  if (days.length < 5) return null;
  const tail = days.slice(-3);
  const head = days.slice(0, days.length - 3);
  const cpa = (arr: typeof days) => {
    const spend = arr.reduce((s, d) => s + d.spend, 0);
    const p = arr.reduce((s, d) => s + d.purchases, 0);
    return p > 0 ? spend / p : null;
  };
  const a = cpa(head);
  const b = cpa(tail);
  if (a === null || b === null || a === 0) return null;
  return (b - a) / a;
}

/** Достаёт значение метрики из нормализованных данных. */
export function resolveMetric(metric: MetricKey, ad: AdCampaignStats, funnel: FunnelMetrics, cfg: ScoringConfig): number | null {
  if (metric.startsWith("checkpointReach:")) {
    const key = metric.split(":")[1];
    return funnel.checkpointReach[key] ?? null;
  }
  switch (metric) {
    case "firstScreenCr":
      return funnel.firstScreenCr;
    case "paywallReach":
      return funnel.paywallReach;
    case "paywallCr":
      return funnel.paywallCr;
    case "trialCr":
      return funnel.trialCr;
    case "upsell1Cr":
      return funnel.upsell1Cr;
    case "upsell2Cr":
      return funnel.hasUpsell2 ? funnel.upsell2Cr : null;
    case "ctr":
      return ad.impressions > 0 ? ad.ctr : null;
    case "cpa":
      return ad.cpa !== null && cfg.targetCpa > 0 ? ad.cpa / cfg.targetCpa : null;
    case "cpm":
      return ad.impressions > 0 ? ad.cpm : null;
    case "frequency":
      return ad.frequency ?? null;
    case "roas":
      return ad.roas;
    case "trend7d":
      return cpaTrend(ad);
    case "dataConfidence":
      return cfg.minVisitors > 0 ? Math.min(1, funnel.visitors / cfg.minVisitors) : 1;
    default:
      return null;
  }
}

function statusFor(c: ScoringCriterion, value: number, points: number): CriterionResult["status"] {
  if (c.lowerIsBetter && c.warnAbove !== undefined && value > c.warnAbove) return "bad";
  if (!c.lowerIsBetter && c.warnBelow !== undefined && value < c.warnBelow) return "bad";
  const share = c.maxPoints > 0 ? points / c.maxPoints : 1;
  if (share >= 0.7) return "good";
  return "warn";
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function noteFor(c: ScoringCriterion, value: number, status: CriterionResult["status"]): string {
  const m = c.metric;
  const fmt =
    m === "cpa"
      ? `${(value * 100).toFixed(0)}% от целевого CPA`
      : m === "ctr"
        ? `${value.toFixed(2)}%`
        : m === "frequency"
          ? value.toFixed(2)
          : m === "trend7d"
            ? `${value > 0 ? "+" : ""}${(value * 100).toFixed(0)}% к CPA`
            : m === "dataConfidence"
              ? `${(value * 100).toFixed(0)}% от нужной выборки`
              : pct(value);
  const verdict = status === "good" ? "в норме" : status === "warn" ? "ниже ожидаемого" : "проблемная зона";
  return `${fmt} — ${verdict}`;
}

function gradeFor(score: number): CampaignScore["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function verdictFor(score: number, cfg: ScoringConfig): Verdict {
  if (score >= cfg.verdicts.scale) return "SCALE";
  if (score >= cfg.verdicts.keep) return "KEEP";
  if (score >= cfg.verdicts.optimize) return "OPTIMIZE";
  return "PAUSE";
}

/** Текстовые рекомендации по проблемным критериям. */
/**
 * Рекомендации только в терминах закупки: креативы, аудитории, плейсменты, бюджет и ставки.
 * Воронку баер не меняет, поэтому слабый шаг воронки трактуется как сигнал о качестве трафика,
 * который на этот шаг пришёл, а не как задача для продукта.
 */
function recommendationsFor(results: CriterionResult[], ad: AdCampaignStats, funnel: FunnelMetrics): string[] {
  const bad = results.filter((r) => r.status === "bad");
  const rec: string[] = [];
  const val = (r: CriterionResult) => r.note.split(" — ")[0];
  for (const r of bad) {
    if (r.metric.startsWith("checkpointReach:")) {
      rec.push(
        `До шага «${r.label}» доходит ${val(r)}: трафик не вовлекается в квиз — сузьте аудиторию (возраст, интересы), исключите Audience Network и дешёвые плейсменты, отключите адсеты с самым низким досмотром.`,
      );
      continue;
    }
    switch (r.metric) {
      case "firstScreenCr":
        rec.push(
          `Первый экран проходят ${val(r)}: клик не совпадает с ожиданием от объявления — сверьте хук и визуал креатива с интро, уберите кликбейтные креативы и плейсменты со случайными кликами (Audience Network, Reels без звука).`,
        );
        break;
      case "paywallReach":
        rec.push(
          `До пэйвола доходит ${val(r)}: аудитория не досиживает квиз — тестируйте более узкие и тёплые аудитории (LAL по покупателям, интересы по теме), отключите адсеты с самым низким доходом до пэйвола.`,
        );
        break;
      case "paywallCr":
        rec.push(
          `Пэйвол конвертирует ${val(r)}: трафик холодный к оплате — смените посыл креатива на прогревающий (ценность результата, а не любопытство), тест LAL 1–3% по покупателям, исключите слишком широкие интересы.`,
        );
        break;
      case "trialCr":
        rec.push(
          `Сквозная конверсия в триал ${val(r)}: качество трафика ниже нормы — пересоберите аудитории и плейсменты, отключите адсеты и креативы без покупок, проверьте гео и возраст.`,
        );
        break;
      case "upsell1Cr":
      case "upsell2Cr":
        rec.push(
          `Апсейлы берут ${val(r)}: аудитория покупает только по минимальной цене — тестируйте более платёжеспособные гео и возраст 35+, LAL по покупателям апсейлов, а не триалов.`,
        );
        break;
      case "cpa":
        rec.push(
          `CPA триала ${ad.cpa?.toFixed(2) ?? "—"} выше цели: снизьте бюджет на 20–30% или отключите самые дорогие адсеты, запустите 2–3 новых креатива на лучшую аудиторию.`,
        );
        break;
      case "ctr":
        rec.push(`CTR ${ad.ctr.toFixed(2)}%: креатив не цепляет — новые хуки в первые 3 секунды, другой формат (статика вместо видео или UGC), проверьте текст и первый кадр.`);
        break;
      case "frequency":
        rec.push(
          `Частота ${ad.frequency?.toFixed(2) ?? "—"}: аудитория выгорает — расширьте таргетинг или дублируйте кампанию на новую аудиторию, ротируйте креативы, снизьте бюджет.`,
        );
        break;
      case "trend7d":
        rec.push("CPA растёт последние дни: креатив устаёт или выросла конкуренция в аукционе — запустите свежие объявления, перераспределите бюджет на стабильные адсеты.");
        break;
      case "dataConfidence":
        rec.push(`Пока мало данных (${funnel.visitors} визитов): не трогайте бюджет и ставки, дайте кампании открутиться до стабильной выборки.`);
        break;
      default:
        rec.push(`Критерий «${r.label}» в проблемной зоне: проверьте аудитории и креативы этой кампании.`);
    }
  }
  return rec;
}

function insightsFor(results: CriterionResult[], ad: AdCampaignStats, funnel: FunnelMetrics, score: number): string[] {
  const out: string[] = [];
  const good = results.filter((r) => r.status === "good" && r.metric !== "dataConfidence").sort((a, b) => b.maxPoints - a.maxPoints);
  if (good[0]) out.push(`Сильная сторона — ${good[0].label}: ${good[0].note.split(" — ")[0]}.`);
  const worst = results.filter((r) => r.status !== "na").sort((a, b) => a.points / a.maxPoints - b.points / b.maxPoints)[0];
  if (worst && worst.status !== "good") out.push(`Главный ограничитель — ${worst.label}: ${worst.note.split(" — ")[0]}.`);
  if (ad.cpa !== null) out.push(`CPA триала ${ad.cpa.toFixed(2)} при ${ad.purchases} триалах и расходе ${ad.spend.toFixed(0)}.`);
  if (funnel.visitors > 0 && funnel.trialCr !== null) out.push(`Сквозная конверсия визит → триал ${pct(funnel.trialCr)} на ${funnel.visitors} визитах.`);
  if (score >= 75) out.push("Кампания готова к масштабированию: увеличивайте бюджет шагами по 20–30%.");
  return out;
}

/** Главная функция: считает скор кампании по конфигу. */
export function scoreCampaign(ad: AdCampaignStats, funnel: FunnelMetrics, cfg: ScoringConfig): CampaignScore {
  const results: CriterionResult[] = [];
  let earned = 0;
  let possible = 0;

  for (const c of cfg.criteria) {
    if (!c.enabled) continue;
    const value = resolveMetric(c.metric, ad, funnel, cfg);
    const sampleOk = !c.minSample || funnel.visitors >= c.minSample || c.metric === "dataConfidence";

    if (value === null || !sampleOk) {
      results.push({
        key: c.key,
        label: c.label,
        group: c.group,
        metric: c.metric,
        value,
        points: 0,
        maxPoints: c.maxPoints,
        status: "na",
        note: value === null ? "нет данных" : `недостаточно данных (нужно ≥ ${c.minSample} визитов)`,
      });
      continue;
    }

    const points = Math.round(pointsForValue(c.bands, value) * 10) / 10;
    const status = statusFor(c, value, points);
    earned += points;
    possible += c.maxPoints;
    results.push({ key: c.key, label: c.label, group: c.group, metric: c.metric, value, points, maxPoints: c.maxPoints, status, note: noteFor(c, value, status) });
  }

  if (possible === 0) {
    return {
      campaignId: ad.campaignId,
      score: 0,
      grade: "N/A",
      verdict: "NO_DATA",
      pointsEarned: 0,
      pointsPossible: 0,
      criteria: results,
      insights: ["Нет данных для оценки: нет событий воронки или кампания не открутилась."],
      recommendations: ["Проверьте, что utm_campaign в PostHog совпадает с id кампании и события воронки приходят."],
    };
  }

  const score = Math.round((earned / possible) * 100);
  let verdict = verdictFor(score, cfg);
  const insights = insightsFor(results, ad, funnel, score);
  // На малой выборке не даём «масштабировать»: высокий скор по 2–3 критериям ещё ничего не значит
  const tooSmall = Math.max(30, Math.round(cfg.minVisitors / 4));
  if (funnel.visitors < tooSmall) {
    verdict = "NO_DATA";
    insights.unshift(`Всего ${funnel.visitors} визитов (нужно хотя бы ${tooSmall}) — вердикт не выносится, скор справочный.`);
  } else if (verdict === "SCALE" && funnel.visitors < cfg.minVisitors) {
    verdict = "KEEP";
    insights.unshift(`Выборка мала (${funnel.visitors} из ${cfg.minVisitors} визитов) — вердикт «масштабировать» придержан до набора данных.`);
  }
  return {
    campaignId: ad.campaignId,
    score,
    grade: gradeFor(score),
    verdict,
    pointsEarned: Math.round(earned * 10) / 10,
    pointsPossible: possible,
    criteria: results,
    insights,
    recommendations: recommendationsFor(results, ad, funnel),
  };
}
