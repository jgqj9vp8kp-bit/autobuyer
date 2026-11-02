import type { AdCampaignStats, FunnelStepDef, ScoringConfig } from "@/lib/types";

/**
 * Единый источник числа триалов.
 *
 * Дашборд баеров отдаёт покупки по атрибуции FB (fbPurchases): свои окна атрибуции, часовой пояс
 * рекламного аккаунта, потери на iOS. PostHog считает реальные события оплаты в воронке, и на них же
 * построены все конверсии. Чтобы на одной странице не было «2 триала вверху и 3 в воронке», триалы
 * и CPA везде берутся из PostHog, а число FB сохраняется в fbPurchases и показывается подписью.
 * Если трафика кампании в PostHog почти нет (трекинг не настроен), остаётся FB.
 */

/** Минимум визитов в воронке, чтобы считать трекинг кампании в PostHog рабочим */
export const MIN_VISITORS_FOR_FUNNEL_TRIALS = 10;

export const TRIAL_STEP_KEY = "trial";

export const trialStepOf = (cfg: Pick<ScoringConfig, "funnel">): FunnelStepDef | undefined => cfg.funnel.find((s) => s.key === TRIAL_STEP_KEY);

/** Заменяет покупки FB триалами из воронки: итог — `total`, по дням — `perDay` (если есть). */
export function applyFunnelTrials(ad: AdCampaignStats, total: number, perDay?: Map<string, number>): AdCampaignStats {
  const fbPurchases = ad.fbPurchases ?? ad.purchases;
  const daily = perDay
    ? ad.daily.map((d) => ({ ...d, fbPurchases: d.fbPurchases ?? d.purchases, purchases: perDay.get(d.date) ?? 0 }))
    : ad.daily;
  return {
    ...ad,
    fbPurchases,
    purchases: total,
    cpa: total > 0 && ad.spend > 0 ? ad.spend / total : null,
    daily,
    trialsSource: "posthog",
  };
}

/** Помечает, что триалы остались по данным FB (в воронке PostHog кампании нет). */
export const keepFbTrials = (ad: AdCampaignStats): AdCampaignStats => ({ ...ad, fbPurchases: ad.fbPurchases ?? ad.purchases, trialsSource: "facebook" });

/** Подпись к числу триалов: откуда оно и сколько показывает другой источник. */
export function trialsNote(ad: Pick<AdCampaignStats, "trialsSource" | "fbPurchases" | "purchases">): string | null {
  if (ad.trialsSource === "facebook") return "по данным FB (кампании нет в воронке PostHog)";
  if (ad.trialsSource === "posthog" && ad.fbPurchases !== undefined && ad.fbPurchases !== ad.purchases) return `в FB-дашборде ${ad.fbPurchases}`;
  return null;
}
