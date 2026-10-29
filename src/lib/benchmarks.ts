import { addDaysIso } from "@/lib/format";
import { detectProduct, PRODUCT_LABEL } from "@/lib/products";
import { extractRows, fetchCampaignStats, mapCapsuledRows, type CapsuledOptions } from "@/lib/sources/capsuled";
import { fetchCampaignHosts, type PostHogOptions } from "@/lib/sources/posthog";
import type { AdCampaignStats, DayBucket, EarlyStageRule, ProductKey, SegmentBenchmark, SegmentInfo } from "@/lib/types";

/**
 * Бенчмарки сегментов: стоимость триала по продукту × гео (по таргетингу) в разрезе дня жизни кампании.
 * Нужны, чтобы отличать «дорого, потому что первый день» от «дорого, потому что сегмент дорогой»:
 * в Японии первый день стабильно вдвое дороже зрелого CPA, в Бразилии стартовая цена сразу близка к зрелой.
 */

export const BENCHMARK_WINDOW_DAYS = 60;

export interface BenchmarkSet {
  windowFrom: string;
  windowTo: string;
  computedAt: string;
  segments: Record<string, SegmentBenchmark>;
  /** первая дата открутки по кампаниям окна; startedBefore — открутка шла уже в первый день окна (возраст неизвестен) */
  launches: Record<string, { first: string; startedBefore: boolean }>;
  campaigns: number;
}

const bucket = (): DayBucket => ({ spend: 0, trials: 0, campaigns: 0 });
export const bucketCpa = (b: DayBucket): number | null => (b.trials > 0 ? b.spend / b.trials : null);
export const segmentKey = (product: ProductKey | null, geo: string | null) => `${product ?? "?"}|${geo ?? "?"}`;
export const segmentLabel = (product: ProductKey | null, geo: string | null) => `${product ? PRODUCT_LABEL[product] : "продукт ?"} × ${geo && geo !== "*" ? geo : geo === "*" ? "все гео" : "гео ?"}`;

const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

function newSegment(key: string, product: ProductKey | null, geo: string | null): SegmentBenchmark {
  return { key, product, geo, campaigns: 0, launched: 0, spend: 0, trials: 0, cpa: null, days: { d1: bucket(), d2: bucket(), d3: bucket(), mature: bucket() }, recovery: { recovered: 0, stayedBad: 0 } };
}

/** Считает бенчмарки по кампаниям с дневной статистикой за окно [windowFrom, windowTo]. */
export function computeBenchmarks(
  campaigns: AdCampaignStats[],
  productOf: (c: AdCampaignStats) => ProductKey | null,
  windowFrom: string,
  windowTo: string,
  targetCpaOf: (p: ProductKey | null) => number,
): BenchmarkSet {
  const segments: Record<string, SegmentBenchmark> = {};
  const launches: BenchmarkSet["launches"] = {};
  const seg = (key: string, product: ProductKey | null, geo: string | null) => (segments[key] ??= newSegment(key, product, geo));

  for (const c of campaigns) {
    const days = [...c.daily].filter((d) => d.spend > 0 || d.impressions > 0).sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) continue;
    const first = days[0].date;
    const startedBefore = first <= windowFrom;
    launches[c.campaignId] = { first, startedBefore };
    const product = productOf(c);
    const geo = c.geo ?? null;
    const spend = days.reduce((s, d) => s + d.spend, 0);
    const trials = days.reduce((s, d) => s + d.purchases, 0);
    const target = targetCpaOf(product);

    // Исход дорогого старта: есть ли смысл «держать» такие кампании в этом сегменте
    let outcome: "recovered" | "stayedBad" | null = null;
    if (!startedBefore && days.length >= 4 && spend >= 60) {
      const d1 = days[0];
      const expensive = (d1.purchases === 0 && d1.spend >= 15) || (d1.purchases > 0 && d1.spend / d1.purchases > 1.5 * target);
      if (expensive) {
        const later = days.slice(2);
        const ls = later.reduce((s, d) => s + d.spend, 0);
        const lt = later.reduce((s, d) => s + d.purchases, 0);
        const lcpa = lt > 0 ? ls / lt : null;
        if (lcpa !== null && lt >= 3 && lcpa <= target * 1.2) outcome = "recovered";
        else if (lcpa === null ? ls >= 50 : lcpa > 1.5 * target) outcome = "stayedBad";
      }
    }

    const targets = [seg(segmentKey(product, geo), product, geo), seg(segmentKey(product, "*"), product, "*"), seg("*|*", null, "*")];
    for (const g of targets) {
      g.campaigns++;
      if (!startedBefore) g.launched++;
      g.spend += spend;
      g.trials += trials;
      if (outcome) g.recovery[outcome]++;
      const touched = new Set<keyof SegmentBenchmark["days"]>();
      days.forEach((d, i) => {
        const b: keyof SegmentBenchmark["days"] = startedBefore ? "mature" : i === 0 ? "d1" : i === 1 ? "d2" : i === 2 ? "d3" : "mature";
        g.days[b].spend += d.spend;
        g.days[b].trials += d.purchases;
        if (!touched.has(b)) {
          touched.add(b);
          g.days[b].campaigns++;
        }
      });
    }
  }
  for (const g of Object.values(segments)) g.cpa = g.trials > 0 ? g.spend / g.trials : null;
  return { windowFrom, windowTo, computedAt: new Date().toISOString(), segments, launches, campaigns: campaigns.length };
}

let cache: { at: number; key: string; value: BenchmarkSet } | null = null;
const TTL = 60 * 60 * 1000;

/** Бенчмарки за 60 дней до dateTo: два запроса к дашборду (по 30 дней) + домены воронок из PostHog. Кеш на час. */
export async function getBenchmarks(
  src: { capsuled: CapsuledOptions | null; posthog: PostHogOptions | null },
  dateTo: string,
  targetCpaOf: (p: ProductKey | null) => number,
): Promise<BenchmarkSet | null> {
  if (!src.capsuled) return null;
  if (cache && cache.key === dateTo && Date.now() - cache.at < TTL) return cache.value;
  const windowFrom = addDaysIso(dateTo, -(BENCHMARK_WINDOW_DAYS - 1));
  const mid = addDaysIso(dateTo, -29);
  const [a, b, hosts] = await Promise.all([
    fetchCampaignStats(src.capsuled, windowFrom, addDaysIso(mid, -1)),
    fetchCampaignStats(src.capsuled, mid, dateTo),
    src.posthog ? fetchCampaignHosts(src.posthog, windowFrom, dateTo).catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>()),
  ]);
  const campaigns = mapCapsuledRows([...extractRows(a.raw), ...extractRows(b.raw)]);
  const productOf = (c: AdCampaignStats) => detectProduct(c, hosts.get(c.campaignId)).product;
  const value = computeBenchmarks(campaigns, productOf, windowFrom, dateTo, targetCpaOf);
  cache = { at: Date.now(), key: dateTo, value };
  return value;
}

export function invalidateBenchmarks() {
  cache = null;
}

/** Положение кампании в сегменте: возраст, подходящий бенчмарк и применимость правила ранней стадии. */
export function segmentInfoFor(set: BenchmarkSet | null, campaignId: string, product: ProductKey | null, geo: string | null, dateTo: string, rule: EarlyStageRule, targetCpa: number): SegmentInfo {
  const label = segmentLabel(product, geo);
  const launch = set?.launches[campaignId];
  const ageDays = !launch ? null : launch.startedBefore ? 999 : daysBetween(launch.first, dateTo) + 1;

  let benchmark: SegmentBenchmark | null = null;
  let benchmarkLevel: SegmentInfo["benchmarkLevel"] = null;
  if (set) {
    const candidates: Array<[SegmentInfo["benchmarkLevel"], string]> = [
      ["segment", segmentKey(product, geo)],
      ["product", segmentKey(product, "*")],
      ["all", "*|*"],
    ];
    for (const [level, key] of candidates) {
      const g = set.segments[key];
      if (g && g.days.mature.trials >= rule.minSegmentTrials) {
        benchmark = g;
        benchmarkLevel = level;
        break;
      }
    }
  }

  let earlyStage = false;
  let earlyNormCpa: number | null = null;
  if (benchmark && ageDays !== null && ageDays >= 1 && ageDays <= rule.maxAgeDays) {
    const mature = bucketCpa(benchmark.days.mature);
    const healthy = mature !== null && mature <= targetCpa * rule.healthySegmentRatio;
    if (healthy) {
      earlyStage = true;
      const dayBucket = benchmark.days[`d${ageDays}` as "d1" | "d2" | "d3"];
      if (dayBucket && dayBucket.trials >= rule.minSegmentTrials) earlyNormCpa = bucketCpa(dayBucket);
    }
  }
  return { product, geo, label, ageDays, firstDeliveryDate: launch?.first, benchmark, benchmarkLevel, earlyStage, earlyNormCpa };
}
