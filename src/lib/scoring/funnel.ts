import type { FunnelCounts, FunnelMetrics, FunnelStepDef } from "@/lib/types";

const ratio = (num: number | undefined, den: number | undefined): number | null => {
  if (!den || den <= 0 || num === undefined) return null;
  return Math.min(1, num / den);
};

/** Переводит счётчики по шагам в метрики воронки по конфигу шагов. */
export function computeFunnelMetrics(counts: FunnelCounts | undefined, funnel: FunnelStepDef[]): FunnelMetrics {
  const c = counts?.steps ?? {};
  const get = (key: string) => c[key] ?? 0;

  const first = funnel[0];
  const second = funnel[1];
  const visitors = first ? get(first.key) : 0;

  // Шаг считается отсутствующим в этой воронке, если на нём 0, а на каком-то из следующих шагов > 0
  // (например, у части воронок нет экрана email). Такие шаги не штрафуются — метрика null.
  const absent = new Set<string>();
  funnel.forEach((s, i) => {
    if (get(s.key) === 0 && funnel.slice(i + 1).some((n) => get(n.key) > 0)) absent.add(s.key);
  });

  const steps: FunnelMetrics["steps"] = [];
  let prev: number | null = null;
  for (const s of funnel) {
    const count = get(s.key);
    const isAbsent = absent.has(s.key);
    steps.push({
      key: s.key,
      label: s.label,
      count,
      fromPrev: isAbsent || prev === null ? null : ratio(count, prev),
      fromStart: isAbsent ? null : ratio(count, visitors),
      milestone: s.milestone,
      optional: s.optional,
    });
    if (!isAbsent) prev = count;
  }

  const checkpointReach: Record<string, number | null> = {};
  for (const s of funnel) {
    if (s.milestone) checkpointReach[s.key] = absent.has(s.key) ? null : ratio(get(s.key), visitors);
  }

  const paywall = get("paywall");
  const trial = get("trial");
  const upsell1 = get("upsell1");
  const upsell2Def = funnel.find((s) => s.key === "upsell2");
  const upsell2 = get("upsell2");
  const hasUpsell2 = Boolean(upsell2Def) && upsell2 > 0;

  return {
    visitors,
    firstScreenCr: second ? ratio(get(second.key), visitors) : null,
    checkpointReach,
    paywallReach: absent.has("paywall") ? null : ratio(paywall, visitors),
    paywallCr: absent.has("paywall") ? null : ratio(trial, paywall),
    trialCr: ratio(trial, visitors),
    upsell1Cr: ratio(upsell1, trial),
    upsell2Cr: hasUpsell2 ? ratio(upsell2, upsell1) : null,
    hasUpsell2,
    funnelAlias: counts?.funnelAlias,
    steps,
  };
}
