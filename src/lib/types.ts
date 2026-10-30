/**
 * Общие доменные типы Autobuyer.
 *
 * Данные приходят из двух источников:
 *  - дашборд баеров (capsuled.space) — расходы/показы/клики/покупки по кампаниям FB;
 *  - PostHog — прохождение пользователями этапов воронки (по utm_campaign = id кампании).
 * Оба источника нормализуются в типы ниже, после чего по ним считается скор.
 */

export type DataSource = "capsuled" | "posthog" | "demo";

/** Продукты, на которые льётся трафик; у каждого свои правила скоринга (см. lib/products.ts). */
export type ProductKey = "azora" | "foxiq" | "robella";
/** Откуда взят продукт кампании */
export type ProductSource = "posthog" | "name-url" | "name" | "account" | "none";
/** Канал трафика: данные по каналам не смешиваются (расход есть только у Facebook) */
export type Channel = "facebook" | "google" | "tiktok" | "other";

/** Дневная статистика по рекламе. */
export interface DailyAdStats {
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

/** Нормализованная статистика рекламной кампании из дашборда. */
export interface AdCampaignStats {
  campaignId: string;
  campaignName: string;
  accountId?: string;
  accountName?: string;
  buyer?: string;
  /** INACTIVE — была открутка в периоде, но не в последний день с данными (статус выведен по расходу, своего у API нет) */
  status: "ACTIVE" | "INACTIVE" | "PAUSED" | "ARCHIVED" | "UNKNOWN";
  /** Последний день с показами или расходом (YYYY-MM-DD) */
  lastActiveDate?: string;
  /** Откуда рекламная статистика: capsuled — из дашборда; posthog — кампания собрана только из воронки (расхода нет) */
  statsSource?: "capsuled" | "posthog" | "demo";
  /** Источник трафика по utm_source (для кампаний без данных дашборда): «Google Ads», «TikTok»… */
  trafficSource?: string;
  /** Сырой utm_source из PostHog (для кампаний без данных дашборда) */
  utmSource?: string;
  objective?: string;
  geo?: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach?: number;
  frequency?: number;
  ctr: number; // %
  cpc: number;
  cpm: number;
  purchases: number;
  revenue: number;
  cpa: number | null;
  roas: number | null;
  daily: DailyAdStats[];
  raw?: unknown;
}

/** Шаг воронки продукта, как его видит PostHog. */
export interface FunnelStepDef {
  key: string; // уникальный ключ шага (используется в правилах скоринга)
  label: string; // человекочитаемое имя
  event: string; // имя события PostHog
  /**
   * Опционально: фильтр по свойству события. Значение сравнивается без учёта регистра;
   * несколько вариантов через `|` ("email|signup_email"), префикс `!` — исключение ("!intro|intro_soulmate").
   */
  property?: { name: string; value: string };
  /** Ключевая точка воронки — подсвечивается отдельно в UI и в скоринге */
  milestone?: boolean;
  /** Шаг может отсутствовать в части воронок (второй апсейл и т.п.) */
  optional?: boolean;
}

/** Количество уникальных пользователей на каждом шаге воронки по кампании. */
export interface FunnelCounts {
  campaignId: string;
  steps: Record<string, number>; // stepKey -> unique users
  /** Алиас воронки (properties.funnel_alias), на которую ведёт кампания */
  funnelAlias?: string;
  /** Домен воронки (properties.$host) — по нему определяется продукт */
  host?: string;
  /** utm_source событий (google / 4 / 22 / tiktok…) — откуда трафик, если кампании нет в дашборде */
  utmSource?: string;
}

/** Метрики воронки, вычисленные из FunnelCounts. */
export interface FunnelMetrics {
  visitors: number;
  firstScreenCr: number | null; // CR после первого экрана
  checkpointReach: Record<string, number | null>; // доходимость до ключевых точек (от visitors)
  paywallReach: number | null; // доходимость до пэйвола
  paywallCr: number | null; // конверсия пэйвола (paywall -> trial)
  trialCr: number | null; // конверсия воронки в оплату триала (visitors -> trial)
  upsell1Cr: number | null; // trial -> upsell1
  upsell2Cr: number | null; // upsell1 -> upsell2 (если есть)
  hasUpsell2: boolean;
  funnelAlias?: string;
  steps: Array<{ key: string; label: string; count: number; fromPrev: number | null; fromStart: number | null; milestone?: boolean; optional?: boolean }>;
}

/** Критерий скоринга. */
export interface ScoringCriterion {
  key: string;
  label: string;
  description?: string;
  /** Какую метрику оцениваем. */
  metric: MetricKey;
  /** Максимум баллов за критерий (вес). */
  maxPoints: number;
  /** Группа для отображения. */
  group: "funnel" | "monetization" | "ads" | "quality";
  /**
   * Пороги: значение метрики -> баллы. Баллы считаются линейной интерполяцией
   * между соседними точками, за пределами — крайние значения.
   * Пример: [{ value: 0.2, points: 0 }, { value: 0.6, points: 10 }]
   */
  bands: Array<{ value: number; points: number }>;
  /** Нижняя граница, ниже которой метрика считается «плохой» (для рекомендаций/подсветки). */
  warnBelow?: number;
  /** Верхняя граница (для метрик «меньше — лучше», например CPA). */
  warnAbove?: number;
  /** Если true — метрика «меньше = лучше» (CPA, CPM, frequency). */
  lowerIsBetter?: boolean;
  enabled: boolean;
  /** Минимум визитов, при котором критерий учитывается (иначе — «недостаточно данных», баллы не начисляются и вес исключается). */
  minSample?: number;
}

export type MetricKey =
  | "firstScreenCr"
  | `checkpointReach:${string}`
  | "paywallReach"
  | "paywallCr"
  | "trialCr"
  | "upsell1Cr"
  | "upsell2Cr"
  | "ctr"
  | "cpa"
  | "cpm"
  | "frequency"
  | "roas"
  | "trend7d"
  | "dataConfidence";

export interface ScoringConfig {
  version: number;
  updatedAt: string;
  /** Целевой CPA триала (USD), используется критерием cpa */
  targetCpa: number;
  /** Минимум визитов для «достоверной» оценки */
  minVisitors: number;
  /** Поблажка молодым кампаниям в здоровых сегментах (см. EarlyStageRule); отсутствует в старых конфигах */
  earlyStage?: EarlyStageRule;
  funnel: FunnelStepDef[];
  criteria: ScoringCriterion[];
  verdicts: {
    scale: number; // >= -> SCALE
    keep: number; // >= -> KEEP
    optimize: number; // >= -> OPTIMIZE, иначе PAUSE
  };
}

export type Verdict = "SCALE" | "KEEP" | "OPTIMIZE" | "PAUSE" | "NO_DATA";

export interface CriterionResult {
  key: string;
  label: string;
  group: ScoringCriterion["group"];
  metric: MetricKey;
  value: number | null;
  points: number;
  maxPoints: number;
  status: "good" | "warn" | "bad" | "na";
  note: string;
}

export interface CampaignScore {
  campaignId: string;
  score: number; // 0..100
  grade: "A" | "B" | "C" | "D" | "F" | "N/A";
  verdict: Verdict;
  pointsEarned: number;
  pointsPossible: number;
  criteria: CriterionResult[];
  insights: string[];
  recommendations: string[];
}

/** Сумма расхода/триалов по дням жизни кампаний сегмента. */
export interface DayBucket {
  spend: number;
  trials: number;
  /** сколько кампаний внесли вклад */
  campaigns: number;
}

/** Бенчмарк сегмента (продукт × гео по таргетингу): CPA по дням жизни кампании за окно наблюдения. */
export interface SegmentBenchmark {
  /** "azora|JP"; "azora|*" — все гео продукта; "*|*" — все кампании */
  key: string;
  product: ProductKey | null;
  geo: string | null;
  campaigns: number;
  /** кампании, запущенные внутри окна (у них известен день 1) */
  launched: number;
  spend: number;
  trials: number;
  cpa: number | null;
  /** d1–d3 — первый/второй/третий день открутки; mature — день 4+ и кампании, стартовавшие до окна */
  days: { d1: DayBucket; d2: DayBucket; d3: DayBucket; mature: DayBucket };
  /** исход кампаний с дорогим первым днём: вышли на норму или остались дорогими */
  recovery: { recovered: number; stayedBad: number };
}

/** Положение кампании относительно своего сегмента (для скоринга и карточки). */
export interface SegmentInfo {
  product: ProductKey | null;
  geo: string | null;
  label: string;
  /** день жизни кампании на конец периода: 1 = первый день открутки; 999 — стартовала до окна наблюдения; null — неизвестно */
  ageDays: number | null;
  firstDeliveryDate?: string;
  benchmark: SegmentBenchmark | null;
  benchmarkLevel: "segment" | "product" | "all" | null;
  /** молодая кампания в здоровом сегменте: «остановить» не выносится */
  earlyStage: boolean;
  /** норма CPA для текущего дня жизни в сегменте, если она применена вместо цели */
  earlyNormCpa: number | null;
}

export interface ScoringContext {
  segment?: SegmentInfo | null;
}

/** Правило ранней стадии: поблажка молодым кампаниям в исторически здоровых сегментах. */
export interface EarlyStageRule {
  /** до какого дня жизни кампания считается молодой */
  maxAgeDays: number;
  /** сегмент здоров, если его зрелый CPA ≤ целевой CPA × это число */
  healthySegmentRatio: number;
  /** минимум триалов в бакете сегмента, чтобы ему верить */
  minSegmentTrials: number;
}

export interface CampaignEvaluation {
  ad: AdCampaignStats;
  funnel: FunnelMetrics;
  score: CampaignScore;
  /** Продукт кампании (null — не определён, оценена по правилам продукта по умолчанию) */
  product: ProductKey | null;
  productSource: ProductSource;
  /** Сегмент и бенчмарк (только в live-режиме) */
  segment?: SegmentInfo | null;
  /** Канал трафика */
  channel: Channel;
}

export interface SourceStatus {
  source: DataSource;
  ok: boolean;
  message: string;
  checkedAt: string;
}

export interface EvaluationResponse {
  dateFrom: string;
  dateTo: string;
  mode: "demo" | "live";
  sources: SourceStatus[];
  campaigns: CampaignEvaluation[];
  generatedAt: string;
}
