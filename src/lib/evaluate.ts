import { BENCHMARK_WINDOW_DAYS, getBenchmarks, segmentInfoFor, type BenchmarkSet } from "@/lib/benchmarks";
import { cacheRaw, loadAllConfigs } from "@/lib/configStore";
import { DEFAULT_PRODUCT, detectProduct, PRODUCT_KEYS } from "@/lib/products";
import { DEFAULT_EARLY_STAGE } from "@/lib/scoring/defaultConfig";
import { computeFunnelMetrics } from "@/lib/scoring/funnel";
import { scoreCampaign } from "@/lib/scoring/engine";
import { fetchCampaignStats } from "@/lib/sources/capsuled";
import { generateDemo } from "@/lib/sources/demo";
import { fetchFunnelCounts } from "@/lib/sources/posthog";
import type { AdCampaignStats, CampaignEvaluation, EvaluationResponse, FunnelCounts, ProductKey, SourceStatus } from "@/lib/types";

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
  // Правила у каждого продукта свои; cfg продукта по умолчанию используется для общих решений (демо, пороги выборки)
  const configs = await loadAllConfigs();
  const cfg = configs[DEFAULT_PRODUCT];
  const sources: SourceStatus[] = [];
  const now = new Date().toISOString();

  let campaigns: AdCampaignStats[] | null = null;
  let funnels: FunnelCounts[] | null = null;
  const funnelsByProduct: Partial<Record<ProductKey, FunnelCounts[]>> = {};

  // Бенчмарки сегментов за 60 дней — параллельно с основными запросами; при ошибке просто без них
  const srcCfg = sourcesConfig();
  const benchPromise: Promise<BenchmarkSet | null> = srcCfg.live
    ? getBenchmarks({ capsuled: srcCfg.capsuled, posthog: srcCfg.posthog }, dateTo, (p) => configs[p ?? DEFAULT_PRODUCT].targetCpa).catch(() => null)
    : Promise.resolve(null);

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
        const imported = r.meta.lastImportAt ? new Date(r.meta.lastImportAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
        const fresh = r.meta.fbStatsTo ? `; данные FB до ${r.meta.fbStatsTo}${imported ? `, импорт ${imported}` : ""}` : "";
        sources.push({ source: "capsuled", ok: true, message: `Получено кампаний: ${r.campaigns.length}${r.meta.truncated ? " (ответ усечён, сузьте период)" : ""}${fresh}`, checkedAt: now });
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
        const opts = { host: phHost, projectId: phProject, apiKey: phKey, campaignExpr: env("POSTHOG_CAMPAIGN_EXPR") || undefined };
        // Один запрос на каждую уникальную воронку: продукты с одинаковыми шагами делят запрос
        const byDef = new Map<string, ProductKey[]>();
        for (const p of PRODUCT_KEYS) {
          const k = JSON.stringify(configs[p].funnel);
          byDef.set(k, [...(byDef.get(k) ?? []), p]);
        }
        const results = await Promise.all([...byDef.values()].map(async (ps) => [ps, await fetchFunnelCounts(opts, configs[ps[0]].funnel, dateFrom, dateTo)] as const));
        const merged = new Map<string, FunnelCounts>();
        for (const [ps, list] of results) {
          for (const p of ps) funnelsByProduct[p] = list;
          for (const f of list) if (!merged.has(f.campaignId)) merged.set(f.campaignId, f);
        }
        funnels = [...merged.values()];
        await cacheRaw("posthog-last", funnels);
        sources.push({ source: "posthog", ok: true, message: `Воронки по кампаниям: ${funnels.length}${results.length > 1 ? ` (${results.length} запроса, воронки продуктов различаются)` : ""}`, checkedAt: now });
      } catch (e) {
        const err = e as Error & { status?: number };
        sources.push({ source: "posthog", ok: false, message: `${err.status ? `HTTP ${err.status}: ` : ""}${err.message}`, checkedAt: now });
      }
    }
  }

  if (campaigns && funnels) {
    // Кампании, которых нет в дашборде (TikTok, остановленные), но с заметным трафиком в PostHog: показываем без расхода
    const known = new Set(campaigns.map((c) => c.campaignId));
    const firstStep = cfg.funnel[0]?.key;
    const minVisits = Math.max(30, Math.round(cfg.minVisitors / 4));
    const extra = funnels.filter((f) => !known.has(f.campaignId) && firstStep && (f.steps[firstStep] ?? 0) >= minVisits).map((f) => campaignFromFunnel(f, dateFrom, dateTo));
    if (extra.length) {
      campaigns = [...campaigns, ...extra];
      const ph = sources.find((s) => s.source === "posthog");
      if (ph) ph.message += `, из них ${extra.length} нет в дашборде (показаны без расхода)`;
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

  const bench = await benchPromise;
  if (srcCfg.live) {
    const cap = sources.find((s) => s.source === "capsuled");
    if (cap?.ok) cap.message += bench ? `; бенчмарки сегментов за ${BENCHMARK_WINDOW_DAYS} дн.: ${Object.values(bench.segments).filter((g) => g.geo !== "*").length}` : "; бенчмарки сегментов недоступны";
  }

  const funnelById = new Map(funnels.map((f) => [f.campaignId, f]));
  const byProduct = new Map<ProductKey, Map<string, FunnelCounts>>();
  for (const p of PRODUCT_KEYS) {
    const list = funnelsByProduct[p];
    if (list) byProduct.set(p, new Map(list.map((f) => [f.campaignId, f])));
  }
  const evaluated: CampaignEvaluation[] = campaigns.map((ad) => {
    const anyCounts = funnelById.get(ad.campaignId);
    // Продукт — по домену воронки из PostHog, иначе по названию кампании/аккаунта; правила берём его
    const { product, source: productSource } = detectProduct(ad, anyCounts?.host);
    const pcfg = configs[product ?? DEFAULT_PRODUCT];
    const counts = (product && byProduct.get(product)?.get(ad.campaignId)) || anyCounts;
    const funnel = computeFunnelMetrics(counts, pcfg.funnel);
    const segment = srcCfg.live ? segmentInfoFor(bench, ad.campaignId, product, ad.geo ?? null, dateTo, pcfg.earlyStage ?? DEFAULT_EARLY_STAGE, pcfg.targetCpa) : null;
    const score = scoreCampaign(ad, funnel, pcfg, { segment });
    if (ad.statsSource === "posthog") {
      const fbLike = /^\d{12,}$/.test(ad.campaignId);
      score.insights.unshift(
        fbLike
          ? `Расхода и CPA нет: за период в FB-дашборде нет строк по этой кампании, хотя трафик в воронку идёт (${ad.trafficSource ?? "источник неизвестен"}). Проверьте, импортируется ли её рекламный аккаунт. Оценка только по воронке.`
          : `Расхода и CPA нет: трафик не из FB (${ad.trafficSource ?? "источник неизвестен"}), дашборд считает только Facebook. Оценка только по воронке.`,
      );
    }
    return { ad, funnel, score, product, productSource, segment };
  });

  evaluated.sort((a, b) => b.score.score - a.score.score || b.ad.spend - a.ad.spend);

  return { dateFrom, dateTo, mode, sources, campaigns: evaluated, generatedAt: now };
}

/** Человекочитаемый источник трафика по utm_source (коды 4/22/19/int3 — так баеры помечают FB/IG). */
export function trafficSourceLabel(utmSource?: string): string {
  const s = (utmSource ?? "").toLowerCase();
  if (!s) return "источник неизвестен";
  if (s.startsWith("google")) return "Google Ads";
  if (s.includes("tiktok") || s === "tt") return "TikTok";
  if (/^(fb|ig|facebook|instagram|an|int\d*|\d+)$/.test(s)) return "Facebook/Instagram";
  return utmSource as string;
}

/** Заглушка рекламной статистики для кампании, известной только по воронке PostHog. */
function campaignFromFunnel(f: FunnelCounts, dateFrom: string, dateTo: string): AdCampaignStats {
  const isFbId = /^\d{12,}$/.test(f.campaignId);
  const trafficSource = trafficSourceLabel(f.utmSource);
  return {
    campaignId: f.campaignId,
    campaignName: `${isFbId ? "FB" : trafficSource} ${f.campaignId}${f.funnelAlias ? ` · ${f.funnelAlias}` : ""}`,
    buyer: undefined,
    status: "UNKNOWN",
    statsSource: "posthog",
    trafficSource,
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
