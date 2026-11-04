import { toAd } from "@/lib/creatives";
import { sourcesConfig } from "@/lib/evaluate";
import { computeFunnelMetrics } from "@/lib/scoring/funnel";
import { scoreCampaign } from "@/lib/scoring/engine";
import { fetchAdsetRows, type AdsetRow } from "@/lib/sources/capsuled";
import { ADSET_EXPR, fetchDailyStepCounts, fetchFunnelCounts } from "@/lib/sources/posthog";
import { applyFunnelTrials, keepFbTrials, MIN_VISITORS_FOR_FUNNEL_TRIALS, TRIAL_STEP_KEY, trialStepOf } from "@/lib/trials";
import type { AdCampaignStats, CampaignScore, FunnelCounts, FunnelMetrics, ScoringConfig, SegmentInfo, Verdict } from "@/lib/types";

/**
 * Адсеты кампании. Дашборд отдаёт level=adset, а в PostHog id адсета лежит в utm_term, поэтому на адсет считается
 * та же воронка, те же триалы и тот же скор, что и на кампанию. Названий адсетов API не отдаёт: вместо них приходит id.
 */

export interface AdsetEvaluation {
  id: string;
  label: string;
  geo?: string;
  ad: AdCampaignStats;
  funnel: FunnelMetrics;
  score: CampaignScore;
}

/** То, что нужно таблице и селектору в браузере */
export interface AdsetRowView {
  id: string;
  label: string;
  geo?: string;
  active: boolean;
  spend: number;
  visitors: number;
  trials: number;
  fbPurchases?: number;
  cpa: number | null;
  ctr: number;
  impressions: number;
  trialCr: number | null;
  paywallCr: number | null;
  score: number;
  grade: CampaignScore["grade"];
  verdict: Verdict;
}

interface AdsetData {
  at: number;
  rows: AdsetRow[];
  funnels: Map<string, FunnelCounts>;
  dailyTrials: Map<string, Map<string, number>> | null;
}

const delivered = (r: { spend: number; impressions: number }) => r.spend > 0 || r.impressions > 0;

const labelOf = (r: AdsetRow) => (r.adsetName && r.adsetName !== r.adsetId ? r.adsetName : `…${r.adsetId.slice(-6)}`);

const cache = new Map<string, AdsetData>();
const TTL = 120_000;

/** Все адсеты за период одним запросом к каждому источнику: страницы кампаний делят этот кеш. */
async function loadData(dateFrom: string, dateTo: string, cfg: ScoringConfig): Promise<AdsetData | null> {
  const src = sourcesConfig();
  if (!src.live || !src.capsuled) return null;
  const key = `${dateFrom}:${dateTo}:${JSON.stringify(cfg.funnel)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit;

  const step = trialStepOf(cfg);
  const opts = src.posthog ? { ...src.posthog, campaignExpr: ADSET_EXPR } : null;
  const [rows, funnels, dailyTrials] = await Promise.all([
    fetchAdsetRows(src.capsuled, dateFrom, dateTo),
    opts ? fetchFunnelCounts(opts, cfg.funnel, dateFrom, dateTo).catch(() => []) : Promise.resolve([]),
    opts && step ? fetchDailyStepCounts(opts, step, dateFrom, dateTo).catch(() => null) : Promise.resolve(null),
  ]);
  const value: AdsetData = { at: Date.now(), rows, funnels: new Map(funnels.map((f) => [f.campaignId, f])), dailyTrials };
  cache.set(key, value);
  return value;
}

export async function campaignAdsets(campaignId: string, dateFrom: string, dateTo: string, cfg: ScoringConfig, segment: SegmentInfo | null): Promise<AdsetEvaluation[]> {
  const data = await loadData(dateFrom, dateTo, cfg).catch(() => null);
  if (!data) return [];
  const all = data.rows.filter(delivered);
  const latestDate = all.reduce<string | undefined>((m, r) => (!m || r.date > m ? r.date : m), undefined);

  const groups = new Map<string, AdsetRow[]>();
  for (const r of all) {
    if (r.campaignId !== campaignId) continue;
    const g = groups.get(r.adsetId);
    if (g) g.push(r);
    else groups.set(r.adsetId, [r]);
  }

  const out = [...groups].map(([id, rows]): AdsetEvaluation => {
    const label = labelOf(rows[0]);
    const geo = rows.find((r) => r.geo)?.geo;
    const funnel = computeFunnelMetrics(data.funnels.get(id), cfg.funnel);
    const rawAd: AdCampaignStats = { ...toAd(id, label, rows, latestDate), geo };
    const trials = funnel.steps.find((s) => s.key === TRIAL_STEP_KEY)?.count;
    const perDay = data.dailyTrials ? (data.dailyTrials.get(id) ?? new Map<string, number>()) : undefined;
    const ad = trials !== undefined && funnel.visitors >= MIN_VISITORS_FOR_FUNNEL_TRIALS ? applyFunnelTrials(rawAd, trials, perDay) : keepFbTrials(rawAd);
    return { id, label, geo, ad, funnel, score: scoreCampaign(ad, funnel, cfg, { segment }) };
  });
  return out.sort((a, b) => b.ad.spend - a.ad.spend);
}

export const adsetViews = (adsets: AdsetEvaluation[]): AdsetRowView[] =>
  adsets.map((a) => ({
    id: a.id,
    label: a.label,
    geo: a.geo,
    active: a.ad.status === "ACTIVE",
    spend: a.ad.spend,
    visitors: a.funnel.visitors,
    trials: a.ad.purchases,
    fbPurchases: a.ad.fbPurchases,
    cpa: a.ad.cpa,
    ctr: a.ad.ctr,
    impressions: a.ad.impressions,
    trialCr: a.funnel.trialCr,
    paywallCr: a.funnel.paywallCr,
    score: a.score.score,
    grade: a.score.grade,
    verdict: a.score.verdict,
  }));
