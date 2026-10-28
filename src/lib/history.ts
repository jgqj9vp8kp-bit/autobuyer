import { loadConfig } from "@/lib/configStore";
import { sourcesConfig } from "@/lib/evaluate";
import { computeFunnelMetrics } from "@/lib/scoring/funnel";
import { scoreCampaign } from "@/lib/scoring/engine";
import { fetchCampaignStats } from "@/lib/sources/capsuled";
import { generateDemo } from "@/lib/sources/demo";
import { fetchFunnelHistory, type FunnelWindow } from "@/lib/sources/posthog";
import { DEFAULT_PRODUCT } from "@/lib/products";
import type { AdCampaignStats, DailyAdStats, ProductKey, Verdict } from "@/lib/types";

/**
 * История скора кампании: для каждого дня считаем скор по данным за скользящее окно
 * (по умолчанию 7 дней, заканчивающихся этим днём). Так видно, как кампания развивается,
 * без шума от маленьких дневных выборок.
 */

export interface ScorePoint {
  day: string;
  score: number;
  grade: string;
  verdict: Verdict;
  visitors: number;
  trials: number;
  spend: number;
  cpa: number | null;
}

export interface ScoreHistory {
  campaignId: string;
  windowDays: number;
  dateFrom: string;
  dateTo: string;
  points: ScorePoint[];
  source: "posthog" | "demo" | "none";
  note?: string;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function* dateRange(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** Сворачивает дневную рекламную статистику в окно [from, to]. */
function adWindow(base: AdCampaignStats, daily: DailyAdStats[], from: string, to: string): AdCampaignStats {
  const rows = daily.filter((d) => d.date >= from && d.date <= to);
  const spend = rows.reduce((s, d) => s + d.spend, 0);
  const impressions = rows.reduce((s, d) => s + d.impressions, 0);
  const clicks = rows.reduce((s, d) => s + d.clicks, 0);
  const purchases = rows.reduce((s, d) => s + d.purchases, 0);
  const revenue = rows.reduce((s, d) => s + d.revenue, 0);
  return {
    ...base,
    spend,
    impressions,
    clicks,
    purchases,
    revenue,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    daily: rows,
    // частота/охват в окне неизвестны — берём значение за весь период (приближение)
    frequency: base.frequency,
    reach: base.reach,
  };
}

export async function scoreHistory(ad: AdCampaignStats, dateTo: string, days = 14, windowDays = 7, product: ProductKey | null = null): Promise<ScoreHistory> {
  const cfg = await loadConfig(product ?? DEFAULT_PRODUCT);
  const dateFrom = addDays(dateTo, -(days - 1));
  const rawFrom = addDays(dateFrom, -(windowDays - 1));
  const src = sourcesConfig();

  let daily: DailyAdStats[] = [];
  let windows: Map<string, Record<string, number>> | null = null;
  let source: ScoreHistory["source"] = "none";
  let note: string | undefined;

  if (src.live) {
    if (src.capsuled) {
      try {
        const r = await fetchCampaignStats(src.capsuled, rawFrom, dateTo);
        daily = r.campaigns.find((c) => c.campaignId === ad.campaignId)?.daily ?? [];
      } catch {
        /* расход недоступен — история только по воронке */
      }
    }
    if (src.posthog) {
      try {
        const rows: FunnelWindow[] = await fetchFunnelHistory(src.posthog, cfg.funnel, ad.campaignId, dateFrom, dateTo, windowDays);
        windows = new Map(rows.map((r) => [r.day, r.steps]));
        source = "posthog";
      } catch (e) {
        note = `PostHog: ${(e as Error).message}`;
      }
    }
  }

  if (!windows) {
    // Демо: суммируем дневные счётчики воронки внутри окна
    const demo = generateDemo(rawFrom, dateTo, cfg.funnel);
    const perDay = demo.dailyFunnels[ad.campaignId];
    if (perDay) {
      daily = demo.campaigns.find((c) => c.campaignId === ad.campaignId)?.daily ?? [];
      windows = new Map();
      for (const day of dateRange(dateFrom, dateTo)) {
        const from = addDays(day, -(windowDays - 1));
        const steps: Record<string, number> = {};
        for (const s of cfg.funnel) steps[s.key] = perDay.filter((p) => p.date >= from && p.date <= day).reduce((sum, p) => sum + (p.steps[s.key] ?? 0), 0);
        windows.set(day, steps);
      }
      source = "demo";
    }
  }

  const points: ScorePoint[] = [];
  for (const day of dateRange(dateFrom, dateTo)) {
    const from = addDays(day, -(windowDays - 1));
    const steps = windows?.get(day);
    const funnel = computeFunnelMetrics(steps ? { campaignId: ad.campaignId, steps } : undefined, cfg.funnel);
    const adW = adWindow(ad, daily, from, day);
    const score = scoreCampaign(adW, funnel, cfg);
    points.push({
      day,
      score: score.grade === "N/A" ? 0 : score.score,
      grade: score.grade,
      verdict: score.verdict,
      visitors: funnel.visitors,
      trials: funnel.steps.find((s) => s.key === "trial")?.count ?? adW.purchases,
      spend: adW.spend,
      cpa: adW.cpa,
    });
  }

  return { campaignId: ad.campaignId, windowDays, dateFrom, dateTo, points, source, note };
}

const cache = new Map<string, { at: number; value: ScoreHistory }>();
export async function scoreHistoryCached(ad: AdCampaignStats, dateTo: string, days = 14, windowDays = 7, product: ProductKey | null = null): Promise<ScoreHistory> {
  const key = `${ad.campaignId}:${dateTo}:${days}:${windowDays}:${product ?? "-"}:${sourcesConfig().live ? "live" : "demo"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.value;
  const value = await scoreHistory(ad, dateTo, days, windowDays, product);
  cache.set(key, { at: Date.now(), value });
  return value;
}
