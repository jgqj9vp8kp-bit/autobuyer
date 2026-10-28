import { cacheRaw, loadConfig } from "@/lib/configStore";
import { computeFunnelMetrics } from "@/lib/scoring/funnel";
import { scoreCampaign } from "@/lib/scoring/engine";
import { fetchCampaignStats } from "@/lib/sources/capsuled";
import { generateDemo } from "@/lib/sources/demo";
import { fetchFunnelCounts } from "@/lib/sources/posthog";
import type { AdCampaignStats, CampaignEvaluation, EvaluationResponse, FunnelCounts, SourceStatus } from "@/lib/types";

/**
 * Оркестрация: берём кампании из дашборда, воронку из PostHog, считаем скор.
 * В demo-режиме (или при недоступности источников) подставляем синтетику
 * и честно показываем это в `sources`.
 */

const env = (k: string) => process.env[k]?.trim() || "";

export function isLiveMode(): boolean {
  return env("DATA_MODE").toLowerCase() === "live";
}

/** Настройки источников из env (null — источник не сконфигурирован). */
export function sourcesConfig() {
  const capsuledKey = env("CAPSULED_API_KEY");
  const phKey = env("POSTHOG_API_KEY");
  const phProject = env("POSTHOG_PROJECT_ID");
  return {
    live: isLiveMode(),
    capsuled: capsuledKey ? { baseUrl: env("CAPSULED_API_URL") || "https://capsuled.space/api/external/v1", apiKey: capsuledKey } : null,
    posthog:
      phKey && phProject
        ? { host: env("POSTHOG_HOST") || "https://eu.posthog.com", projectId: phProject, apiKey: phKey, campaignExpr: env("POSTHOG_CAMPAIGN_EXPR") || undefined }
        : null,
  };
}

export async function evaluateCampaigns(dateFrom: string, dateTo: string): Promise<EvaluationResponse> {
  const cfg = await loadConfig();
  const sources: SourceStatus[] = [];
  const now = new Date().toISOString();

  let campaigns: AdCampaignStats[] | null = null;
  let funnels: FunnelCounts[] | null = null;

  if (isLiveMode()) {
    // --- Дашборд баеров
    const apiKey = env("CAPSULED_API_KEY");
    const baseUrl = env("CAPSULED_API_URL") || "https://capsuled.space/api/external/v1";
    if (!apiKey) {
      sources.push({ source: "capsuled", ok: false, message: "CAPSULED_API_KEY не задан", checkedAt: now });
    } else {
      try {
        const r = await fetchCampaignStats({ baseUrl, apiKey }, dateFrom, dateTo);
        campaigns = r.campaigns;
        await cacheRaw("capsuled-last", r.raw);
        sources.push({ source: "capsuled", ok: true, message: `Получено кампаний: ${r.campaigns.length}`, checkedAt: now });
      } catch (e) {
        const err = e as Error & { status?: number };
        sources.push({ source: "capsuled", ok: false, message: `${err.status ? `HTTP ${err.status}: ` : ""}${err.message}`, checkedAt: now });
      }
    }

    // --- PostHog
    const phKey = env("POSTHOG_API_KEY");
    const phProject = env("POSTHOG_PROJECT_ID");
    const phHost = env("POSTHOG_HOST") || "https://eu.posthog.com";
    if (!phKey || !phProject) {
      sources.push({ source: "posthog", ok: false, message: "POSTHOG_API_KEY / POSTHOG_PROJECT_ID не заданы", checkedAt: now });
    } else {
      try {
        funnels = await fetchFunnelCounts({ host: phHost, projectId: phProject, apiKey: phKey, campaignExpr: env("POSTHOG_CAMPAIGN_EXPR") || undefined }, cfg.funnel, dateFrom, dateTo);
        await cacheRaw("posthog-last", funnels);
        sources.push({ source: "posthog", ok: true, message: `Воронки по кампаниям: ${funnels.length}`, checkedAt: now });
      } catch (e) {
        const err = e as Error & { status?: number };
        sources.push({ source: "posthog", ok: false, message: `${err.status ? `HTTP ${err.status}: ` : ""}${err.message}`, checkedAt: now });
      }
    }
  }

  let mode: EvaluationResponse["mode"] = "live";
  if (!campaigns && funnels && funnels.length) {
    // Дашборд баеров недоступен, но PostHog отвечает: показываем кампании из воронки без рекламных метрик
    campaigns = funnels.map((f) => campaignFromFunnel(f, dateFrom, dateTo));
    const cap = sources.find((s) => s.source === "capsuled");
    if (cap) cap.message += " — кампании собраны из PostHog (utm_campaign), расход/CPA недоступны";
  }
  if (!campaigns) {
    const demo = generateDemo(dateFrom, dateTo, cfg.funnel);
    campaigns = demo.campaigns;
    if (!funnels) funnels = demo.funnels;
    mode = "demo";
    sources.push({ source: "demo", ok: true, message: isLiveMode() ? "Источник кампаний недоступен — показаны демо-данные" : "DATA_MODE=demo — синтетические данные", checkedAt: now });
  } else if (!funnels) {
    // Кампании есть, воронки нет — скор будет считаться только по рекламным метрикам
    funnels = [];
  }

  const funnelById = new Map(funnels.map((f) => [f.campaignId, f]));
  const evaluated: CampaignEvaluation[] = campaigns.map((ad) => {
    const funnel = computeFunnelMetrics(funnelById.get(ad.campaignId), cfg.funnel);
    const score = scoreCampaign(ad, funnel, cfg);
    return { ad, funnel, score };
  });

  evaluated.sort((a, b) => b.score.score - a.score.score || b.ad.spend - a.ad.spend);

  return { dateFrom, dateTo, mode, sources, campaigns: evaluated, generatedAt: now };
}

/** Заглушка рекламной статистики для кампании, известной только по воронке PostHog. */
function campaignFromFunnel(f: FunnelCounts, dateFrom: string, dateTo: string): AdCampaignStats {
  const isFbId = /^\d{12,}$/.test(f.campaignId);
  return {
    campaignId: f.campaignId,
    campaignName: isFbId ? `FB ${f.campaignId}${f.funnelAlias ? ` · ${f.funnelAlias}` : ""}` : f.campaignId,
    buyer: undefined,
    status: "UNKNOWN",
    geo: undefined,
    spend: 0,
    impressions: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    purchases: f.steps.trial ?? 0,
    revenue: 0,
    cpa: null,
    roas: null,
    daily: [],
    raw: { source: "posthog", dateFrom, dateTo },
  };
}

/**
 * Простой in-memory кеш на 2 минуты, чтобы не долбить источники при каждом рендере.
 * Если в live-режиме источники временно отвалились (сеть, таймаут), отдаём последний
 * удачный результат по этому периоду вместо демо-данных — иначе страницы кампаний
 * «пропадают» на время сбоя.
 */
const cache = new Map<string, { at: number; value: EvaluationResponse }>();
const lastGood = new Map<string, { at: number; value: EvaluationResponse }>();
const STALE_TTL = 6 * 60 * 60 * 1000;

const fellBackToDemo = (v: EvaluationResponse) => isLiveMode() && v.mode === "demo";

export async function evaluateCached(dateFrom: string, dateTo: string, force = false): Promise<EvaluationResponse> {
  const key = `${dateFrom}:${dateTo}:${isLiveMode() ? "live" : "demo"}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < 120_000) return hit.value;
  let value = await evaluateCampaigns(dateFrom, dateTo);
  if (fellBackToDemo(value)) {
    const good = lastGood.get(key);
    if (good && Date.now() - good.at < STALE_TTL) {
      const failed = value.sources.filter((s) => !s.ok).map((s) => s.message).join("; ");
      value = {
        ...good.value,
        sources: [
          ...good.value.sources,
          { source: "demo", ok: false, message: `Источники недоступны (${failed}) — показаны данные от ${new Date(good.at).toLocaleTimeString("ru-RU")}`, checkedAt: value.generatedAt },
        ],
      };
    }
  } else if (isLiveMode()) {
    lastGood.set(key, { at: Date.now(), value });
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateCache() {
  cache.clear();
  lastGood.clear();
}

/** Диапазон дат по умолчанию: последние 7 дней включительно. */
export function defaultRange(): { dateFrom: string; dateTo: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 6);
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10) };
}
