import { addDaysIso } from "@/lib/format";
import { fetchCampaignStats, type CapsuledOptions } from "@/lib/sources/capsuled";
import { fetchCampaignFirstSeen, type PostHogOptions } from "@/lib/sources/posthog";
import type { AdCampaignStats, DailyAdStats } from "@/lib/types";

/**
 * Дата старта кампании. В API дашборда нет даты создания, поэтому старт — первый день открутки
 * по всей истории дашборда (она с 23.03.2026, ~10 МБ за всё время). Для кампаний вне дашборда
 * (Google Ads, TikTok) старт — первый визит в воронку PostHog (события там с 29.09.2026).
 * Если дата совпадает с началом истории источника, настоящий старт мог быть раньше: startApprox.
 */

const HISTORY_FROM = "2026-01-01";
/** API: не больше 180 дней и 10 000 строк за запрос; 90 дней — около 6 000 строк */
const CHUNK_DAYS = 90;
const TTL = 6 * 60 * 60 * 1000;

export interface CampaignStartIndex {
  builtAt: number;
  dashboard: Map<string, string>;
  funnel: Map<string, string>;
  dashboardFloor: string | null;
  funnelFloor: string | null;
}

type StartFields = Pick<AdCampaignStats, "startDate" | "startSource" | "startApprox" | "ageDays">;

const delivered = (d: DailyAdStats) => d.spend > 0 || d.impressions > 0;

const earliest = (values: Iterable<string>): string | null => {
  let min: string | null = null;
  for (const v of values) if (!min || v < min) min = v;
  return min;
};

/** Загружает диапазон; если ответ усечён лимитом строк, делит диапазон пополам. */
async function fetchRange(opts: CapsuledOptions, from: string, to: string): Promise<AdCampaignStats[]> {
  const r = await fetchCampaignStats(opts, from, to);
  if (!r.meta.truncated || from >= to) return r.campaigns;
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  const mid = addDaysIso(from, Math.floor(days / 2));
  const [a, b] = await Promise.all([fetchRange(opts, from, mid), fetchRange(opts, addDaysIso(mid, 1), to)]);
  return [...a, ...b];
}

async function buildIndex(src: { capsuled: CapsuledOptions | null; posthog: PostHogOptions | null }, today: string): Promise<CampaignStartIndex> {
  const ranges: Array<[string, string]> = [];
  for (let from = HISTORY_FROM; from <= today; from = addDaysIso(from, CHUNK_DAYS)) {
    const end = addDaysIso(from, CHUNK_DAYS - 1);
    ranges.push([from, end < today ? end : today]);
  }
  const capsuled = src.capsuled;
  const [chunks, funnel] = await Promise.all([
    capsuled ? Promise.all(ranges.map(([f, t]) => fetchRange(capsuled, f, t))) : Promise.resolve([] as AdCampaignStats[][]),
    src.posthog ? fetchCampaignFirstSeen(src.posthog, HISTORY_FROM, today).catch(() => new Map<string, string>()) : Promise.resolve(new Map<string, string>()),
  ]);
  const dashboard = new Map<string, string>();
  for (const c of chunks.flat()) {
    const first = c.daily.find(delivered)?.date;
    if (!first) continue;
    const known = dashboard.get(c.campaignId);
    if (!known || first < known) dashboard.set(c.campaignId, first);
  }
  return { builtAt: Date.now(), dashboard, funnel, dashboardFloor: earliest(dashboard.values()), funnelFloor: earliest(funnel.values()) };
}

let cache: CampaignStartIndex | null = null;
let inflight: Promise<CampaignStartIndex> | null = null;

/** Индекс дат старта. Кеш на 6 часов; устаревший кеш отдаётся сразу, а обновление идёт в фоне. */
export async function getCampaignStarts(src: { capsuled: CapsuledOptions | null; posthog: PostHogOptions | null }, today: string): Promise<CampaignStartIndex | null> {
  if (!src.capsuled && !src.posthog) return null;
  if (cache && Date.now() - cache.builtAt < TTL) return cache;
  inflight ??= buildIndex(src, today)
    .then((v) => (cache = v))
    .finally(() => {
      inflight = null;
    });
  if (cache) {
    inflight.catch(() => {
      /* оставляем прошлый индекс */
    });
    return cache;
  }
  return inflight;
}

/**
 * Старт кампании: самый ранний день открутки из индекса, окна бенчмарков и выбранного периода,
 * иначе первый визит в PostHog. Без индекса дата известна только как верхняя граница.
 */
export function resolveCampaignStart(ad: AdCampaignStats, index: CampaignStartIndex | null, windowFirst: string | undefined, dateTo: string): StartFields {
  const age = (date: string) => Math.max(1, Math.round((Date.parse(dateTo) - Date.parse(date)) / 86400000) + 1);
  const known = [index?.dashboard.get(ad.campaignId), windowFirst, ad.daily.find(delivered)?.date].filter((d): d is string => Boolean(d));
  const date = earliest(known);
  if (date) {
    const floor = index?.dashboardFloor;
    return { startDate: date, startSource: "dashboard", startApprox: !floor || date <= floor, ageDays: age(date) };
  }
  const seen = index?.funnel.get(ad.campaignId);
  if (seen) return { startDate: seen, startSource: "posthog", startApprox: !index?.funnelFloor || seen <= index.funnelFloor, ageDays: age(seen) };
  return {};
}
