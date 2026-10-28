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

export interface CampaignEvaluation {
  ad: AdCampaignStats;
  funnel: FunnelMetrics;
  score: CampaignScore;
  /** Продукт кампании (null — не определён, оценена по правилам продукта по умолчанию) */
  product: ProductKey | null;
  productSource: ProductSource;
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
