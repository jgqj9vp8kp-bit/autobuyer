import { sourcesConfig } from "@/lib/evaluate";
import { ADSET_EXPR, fetchCampaignScreens, type ScreenCount } from "@/lib/sources/posthog";
import type { FunnelStepDef } from "@/lib/types";

/**
 * Прохождение всех экранов воронки кампании. Порядок — по screen_index из событий PostHog,
 * люди считаются так же, как шаги воронки (уникальные за период), поэтому цифры совпадают с воронкой
 * на странице. Столбец может быть выше предыдущего: часть людей начала раньше периода и вернулась.
 */

export interface ScreenFlowPoint {
  key: string;
  label: string;
  users: number;
  /** доля от первого экрана */
  fromStart: number;
  /** доля от предыдущего экрана основного пути; null у первого экрана и у экранов ошибок */
  fromPrev: number | null;
  milestone: boolean;
  /** экран ошибки или побочной ветки: не входит в основной путь */
  side: boolean;
}

export interface ScreenDrop {
  from: string;
  to: string;
  lost: number;
  fromUsers: number;
}

/** Экраны ошибок оплаты и побочных веток */
const SIDE_SCREEN = /^(failed_|paywall_|cta_skip)|_failed$|^final_no_payment$/;

/**
 * Ветка ответа (q_soulmate_age_range_female, a_quality_kindness…): на ней людей заметно меньше, чем на экранах
 * дальше по пути, значит туда попала только часть аудитории, а остальные шли параллельно.
 */
const BRANCH_RATIO = 0.7;

/** Ниже этой выборки «самая большая потеря» ничего не значит */
const MIN_USERS_FOR_DROP = 20;

const milestoneScreens = (funnel: FunnelStepDef[]) =>
  new Set(
    funnel
      .filter((s) => s.milestone && s.property?.name === "screen_id" && !s.property.value.startsWith("!"))
      .flatMap((s) => (s.property as { value: string }).value.split("|"))
      .map((v) => v.trim().toLowerCase()),
  );

export function buildScreenFlow(rows: ScreenCount[], funnel: FunnelStepDef[]): ScreenFlowPoint[] {
  const milestones = milestoneScreens(funnel);
  const start = rows.find((r) => !SIDE_SCREEN.test(r.screen))?.users ?? 0;
  if (start === 0) return [];
  // Ветки ищем только до пэйвола: на него возвращаются люди, начавшие раньше периода, и сравнение с ним врёт
  const paywall = rows.findIndex((r) => r.screen === "paywall");
  const limit = paywall >= 0 ? paywall : rows.length;
  const laterMax = new Array<number>(rows.length).fill(0);
  let max = 0;
  for (let i = limit - 1; i >= 0; i--) {
    laterMax[i] = max;
    if (!SIDE_SCREEN.test(rows[i].screen)) max = Math.max(max, rows[i].users);
  }
  let prev: number | null = null;
  return rows.map((r, i) => {
    const branch = i < limit && !milestones.has(r.screen) && r.users < BRANCH_RATIO * laterMax[i];
    const side = SIDE_SCREEN.test(r.screen) || branch;
    const fromPrev = side || prev === null || prev === 0 ? null : r.users / prev;
    if (!side) prev = r.users;
    return { key: r.screen, label: r.label, users: r.users, fromStart: r.users / start, fromPrev, milestone: milestones.has(r.screen), side };
  });
}

/** Самая большая потеря людей на основном пути до пэйвола: дальше падение — это уже конверсия в оплату. */
export function biggestDropBeforePaywall(points: ScreenFlowPoint[]): ScreenDrop | null {
  const main = points.filter((p) => !p.side);
  const paywall = main.findIndex((p) => p.key === "paywall");
  const path = paywall > 0 ? main.slice(0, paywall + 1) : main;
  let best: ScreenDrop | null = null;
  for (let i = 1; i < path.length; i++) {
    const lost = path[i - 1].users - path[i].users;
    if (path[i - 1].users >= MIN_USERS_FOR_DROP && lost > 0 && (!best || lost > best.lost)) best = { from: path[i - 1].label, to: path[i].label, lost, fromUsers: path[i - 1].users };
  }
  return best;
}

const cache = new Map<string, { at: number; value: ScreenCount[] }>();

/** Экраны кампании или одного её адсета за период; пусто в demo-режиме и при ошибке PostHog (график просто не показывается). */
export async function campaignScreensCached(campaignId: string, dateFrom: string, dateTo: string, adsetId?: string): Promise<ScreenCount[]> {
  const src = sourcesConfig();
  if (!src.live || !src.posthog) return [];
  const key = `${adsetId ? `adset:${adsetId}` : campaignId}:${dateFrom}:${dateTo}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120_000) return hit.value;
  try {
    const value = adsetId ? await fetchCampaignScreens({ ...src.posthog, campaignExpr: ADSET_EXPR }, adsetId, dateFrom, dateTo) : await fetchCampaignScreens(src.posthog, campaignId, dateFrom, dateTo);
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return [];
  }
}
