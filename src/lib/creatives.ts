import { loadAllConfigs } from "@/lib/configStore";
import { sourcesConfig } from "@/lib/evaluate";
import { DEFAULT_PRODUCT, detectProduct, PRODUCT_KEYS, productFromHost } from "@/lib/products";
import { computeFunnelMetrics } from "@/lib/scoring/funnel";
import { scoreCampaign } from "@/lib/scoring/engine";
import { fetchCreativeRows, type CreativeCoverage, type CreativeRow } from "@/lib/sources/capsuled";
import { fetchDailyStepCounts, fetchFunnelCounts } from "@/lib/sources/posthog";
import { applyFunnelTrials, keepFbTrials, MIN_VISITORS_FOR_FUNNEL_TRIALS, TRIAL_STEP_KEY, trialStepOf } from "@/lib/trials";
import type { AdCampaignStats, CampaignScore, DailyAdStats, FunnelCounts, FunnelMetrics, ProductKey } from "@/lib/types";

/**
 * Оценка креативов. Дашборд отдаёт строки level=creative (креатив × объявление × день), а PostHog знает
 * id объявления: utm_content у событий воронки, у покупок апсейлов — $initial_utm_content персоны.
 * Поэтому на креатив считается та же воронка, те же триалы и тот же скор, что и на кампанию.
 *
 * Один и тот же визуал баеры заливают под разными creativeId (дубли кампаний). Для закупки это один креатив,
 * поэтому строки склеиваются по файлу превью; разные тексты при этом не смешиваются (проверено на данных).
 */

const AD_EXPR = "coalesce(nullIf(toString(properties.utm_content), ''), nullIf(toString(person.properties.$initial_utm_content), ''), '')";

/** Суффикс названия от Meta: дата создания и хеш файла */
const NAME_SUFFIX = /\s*(\d{4}-\d{2}-\d{2})-[0-9a-f]{6,}\s*$/i;

export interface CreativeCampaign {
  id: string;
  name: string;
  spend: number;
}

export interface CreativeEvaluation {
  key: string;
  name: string;
  type: string | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  destinationUrl: string | null;
  destinationHost: string | null;
  /** Дата создания из названия креатива */
  createdDate?: string;
  creativeIds: string[];
  adCount: number;
  campaigns: CreativeCampaign[];
  buyers: string[];
  geos: string[];
  product: ProductKey | null;
  ad: AdCampaignStats;
  funnel: FunnelMetrics;
  score: Pick<CampaignScore, "score" | "grade" | "verdict" | "recommendations">;
}

export interface CreativeReport {
  dateFrom: string;
  dateTo: string;
  creatives: CreativeEvaluation[];
  coverage: CreativeCoverage | null;
  truncated: boolean;
  /** Название кампании, если отчёт построен по одной кампании */
  campaignName?: string;
  /** Что пошло не так: источник недоступен, воронка не загрузилась */
  message?: string;
  generatedAt: string;
}

interface CreativeData {
  at: number;
  rows: CreativeRow[];
  coverage: CreativeCoverage | null;
  truncated: boolean;
  funnels: Map<string, Map<string, FunnelCounts>>;
  dailyTrials: Map<string, Map<string, Map<string, number>>>;
  funnelError?: string;
}

const delivered = (r: { spend: number; impressions: number }) => r.spend > 0 || r.impressions > 0;

const visualKey = (r: CreativeRow) => {
  const file = r.thumbnailUrl?.split("?")[0].split("/").pop();
  return file ? `v:${file}` : `c:${r.creativeId}`;
};

const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const cache = new Map<string, CreativeData>();
const TTL = 120_000;

async function loadData(dateFrom: string, dateTo: string, force: boolean): Promise<CreativeData | null> {
  const src = sourcesConfig();
  if (!src.live || !src.capsuled) return null;
  const key = `${dateFrom}:${dateTo}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL) return hit;

  const configs = await loadAllConfigs();
  const stats = fetchCreativeRows(src.capsuled, dateFrom, dateTo);
  const funnels = new Map<string, Map<string, FunnelCounts>>();
  const dailyTrials = new Map<string, Map<string, Map<string, number>>>();
  let funnelError: string | undefined;

  if (src.posthog) {
    const opts = { ...src.posthog, campaignExpr: AD_EXPR };
    const funnelDefs = new Map(PRODUCT_KEYS.map((p) => [JSON.stringify(configs[p].funnel), configs[p].funnel] as const));
    const trialDefs = new Map(PRODUCT_KEYS.map((p) => [JSON.stringify(trialStepOf(configs[p]) ?? null), trialStepOf(configs[p])] as const));
    try {
      const [funnelLists, dailyLists] = await Promise.all([
        Promise.all([...funnelDefs].map(async ([k, def]) => [k, await fetchFunnelCounts(opts, def, dateFrom, dateTo)] as const)),
        Promise.all([...trialDefs].filter(([, step]) => step).map(async ([k, step]) => [k, await fetchDailyStepCounts(opts, step!, dateFrom, dateTo).catch(() => null)] as const)),
      ]);
      for (const [k, list] of funnelLists) funnels.set(k, new Map(list.map((f) => [f.campaignId, f])));
      for (const [k, m] of dailyLists) if (m) dailyTrials.set(k, m);
    } catch (e) {
      funnelError = (e as Error).message;
    }
  } else {
    funnelError = "PostHog не настроен";
  }

  const r = await stats;
  const value: CreativeData = { at: Date.now(), rows: r.rows, coverage: r.coverage, truncated: r.meta.truncated === true, funnels, dailyTrials, funnelError };
  cache.set(key, value);
  return value;
}

function sumCounts(adIds: Iterable<string>, byAd: Map<string, FunnelCounts> | undefined, key: string): FunnelCounts | undefined {
  if (!byAd) return undefined;
  const steps: Record<string, number> = {};
  let found = false;
  let host: string | undefined;
  let alias: string | undefined;
  for (const id of adIds) {
    const f = byAd.get(id);
    if (!f) continue;
    found = true;
    host ??= f.host;
    alias ??= f.funnelAlias;
    for (const [k, v] of Object.entries(f.steps)) steps[k] = (steps[k] ?? 0) + v;
  }
  return found ? { campaignId: key, steps, host, funnelAlias: alias } : undefined;
}

function sumDaily(adIds: Iterable<string>, byAd: Map<string, Map<string, number>> | undefined): Map<string, number> | undefined {
  if (!byAd) return undefined;
  const out = new Map<string, number>();
  for (const id of adIds) for (const [d, n] of byAd.get(id) ?? []) out.set(d, (out.get(d) ?? 0) + n);
  return out;
}

type StatRow = Pick<CreativeRow, "date" | "spend" | "impressions" | "clicks" | "reach" | "purchases" | "revenue">;

/** Сводит дневные строки креатива или адсета в форму кампании: так работают воронка, триалы и скор. */
export function toAd(key: string, name: string, rows: StatRow[], latestDate: string | undefined): AdCampaignStats {
  const days = new Map<string, DailyAdStats>();
  let reach = 0;
  for (const r of rows) {
    const d = days.get(r.date) ?? { date: r.date, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
    d.spend += r.spend;
    d.impressions += r.impressions;
    d.clicks += r.clicks;
    d.purchases += r.purchases;
    d.revenue += r.revenue;
    days.set(r.date, d);
    reach += r.reach;
  }
  const daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sum = (f: (d: DailyAdStats) => number) => daily.reduce((s, d) => s + f(d), 0);
  const spend = sum((d) => d.spend);
  const impressions = sum((d) => d.impressions);
  const clicks = sum((d) => d.clicks);
  const purchases = sum((d) => d.purchases);
  const revenue = sum((d) => d.revenue);
  const lastActiveDate = [...daily].reverse().find(delivered)?.date;
  return {
    campaignId: key,
    campaignName: name,
    status: lastActiveDate && latestDate && lastActiveDate >= latestDate ? "ACTIVE" : "INACTIVE",
    lastActiveDate,
    statsSource: "capsuled",
    spend,
    impressions,
    clicks,
    reach: reach > 0 ? reach : undefined,
    frequency: reach > 0 ? impressions / reach : undefined,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    purchases,
    revenue,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    daily,
  };
}

const uniqueSorted = (values: Array<string | undefined>) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

export async function evaluateCreatives(dateFrom: string, dateTo: string, options: { campaignId?: string; adsetId?: string; force?: boolean } = {}): Promise<CreativeReport> {
  const generatedAt = new Date().toISOString();
  const base = { dateFrom, dateTo, generatedAt };
  let data: CreativeData | null;
  try {
    data = await loadData(dateFrom, dateTo, Boolean(options.force));
  } catch (e) {
    return { ...base, creatives: [], coverage: null, truncated: false, message: `Дашборд недоступен: ${(e as Error).message}` };
  }
  if (!data) return { ...base, creatives: [], coverage: null, truncated: false, message: "Креативы доступны только в live-режиме с настроенным дашбордом." };

  const configs = await loadAllConfigs();
  const allRows = data.rows.filter(delivered);
  const latestDate = allRows.reduce<string | undefined>((m, r) => (!m || r.date > m ? r.date : m), undefined);
  const rows = allRows.filter((r) => (!options.campaignId || r.campaignId === options.campaignId) && (!options.adsetId || r.adsetId === options.adsetId));

  const groups = new Map<string, CreativeRow[]>();
  for (const r of rows) {
    const k = visualKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const creatives: CreativeEvaluation[] = [...groups].map(([key, group]) => {
    const named = group.find((r) => r.name)?.name ?? null;
    const destinationUrl = group.find((r) => r.destinationUrl)?.destinationUrl ?? null;
    const destinationHost = hostOf(destinationUrl);
    const name = named?.replace(NAME_SUFFIX, "").trim() || destinationHost || "Без названия";
    const createdDate = uniqueSorted(group.map((r) => r.name?.match(NAME_SUFFIX)?.[1]))[0];
    const adIds = new Set(group.flatMap((r) => r.adIds));

    // Продукт — по домену ссылки креатива; если он неизвестен, как у кампаний
    const anyFunnel = data.funnels.values().next().value as Map<string, FunnelCounts> | undefined;
    const first = group[0];
    const product = productFromHost(destinationHost) ?? detectProduct({ campaignName: first.campaignName, accountName: first.accountName }, sumCounts(adIds, anyFunnel, key)?.host).product;
    const pkey = product ?? DEFAULT_PRODUCT;
    const cfg = configs[pkey];

    const counts = sumCounts(adIds, data.funnels.get(JSON.stringify(cfg.funnel)), key);
    const funnel = computeFunnelMetrics(counts, cfg.funnel);
    const rawAd = toAd(key, name, group, latestDate);
    const trials = funnel.steps.find((s) => s.key === TRIAL_STEP_KEY)?.count;
    const perDay = sumDaily(adIds, data.dailyTrials.get(JSON.stringify(trialStepOf(cfg) ?? null)));
    const ad = trials !== undefined && funnel.visitors >= MIN_VISITORS_FOR_FUNNEL_TRIALS ? applyFunnelTrials(rawAd, trials, perDay) : keepFbTrials(rawAd);
    const { score, grade, verdict, recommendations } = scoreCampaign(ad, funnel, cfg);

    const byCampaign = new Map<string, CreativeCampaign>();
    for (const r of group) {
      const c = byCampaign.get(r.campaignId) ?? { id: r.campaignId, name: r.campaignName, spend: 0 };
      c.spend += r.spend;
      byCampaign.set(r.campaignId, c);
    }

    return {
      key,
      name,
      type: group.find((r) => r.type)?.type ?? null,
      thumbnailUrl: group.find((r) => r.thumbnailUrl)?.thumbnailUrl ?? null,
      imageUrl: group.find((r) => r.imageUrl)?.imageUrl ?? null,
      destinationUrl,
      destinationHost,
      createdDate,
      creativeIds: uniqueSorted(group.map((r) => r.creativeId)),
      adCount: adIds.size,
      campaigns: [...byCampaign.values()].sort((a, b) => b.spend - a.spend),
      buyers: uniqueSorted(group.map((r) => r.buyer)),
      geos: uniqueSorted(group.map((r) => r.geo)),
      product,
      // Дневные данные уже учтены в скоре, на страницу они не нужны
      ad: { ...ad, daily: [] },
      funnel,
      score: { score, grade, verdict, recommendations },
    };
  });

  creatives.sort((a, b) => b.ad.spend - a.ad.spend);
  return {
    ...base,
    creatives,
    coverage: data.coverage,
    truncated: data.truncated,
    campaignName: options.campaignId ? rows[0]?.campaignName : undefined,
    message: data.funnelError ? `Воронка недоступна (${data.funnelError}): показаны только данные дашборда.` : undefined,
  };
}
