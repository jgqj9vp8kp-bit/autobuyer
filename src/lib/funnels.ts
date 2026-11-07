import type { FunnelAssignment, FunnelShare, FunnelSource } from "@/lib/types";

/**
 * Воронка кампании. Главный источник — PostHog: воронка, куда пришло больше всего посетителей кампании
 * (сценарий отмены подписки не считается). Если трекинга нет — путь ссылки креатива
 * (azora-astro.com/palm-reading-month-web → palm-reading-month-web), затем известная воронка в названии кампании.
 * На данных 1–7.11 путь ссылки совпал с главной воронкой PostHog у всех 164 кампаний, где есть оба.
 */

/** Значение фильтра «воронка не определена» */
export const NO_FUNNEL = "none";

export const FUNNEL_SOURCE_LABEL: Record<FunnelSource, string> = {
  posthog: "по посетителям в PostHog",
  creative_url: "по ссылке креатива",
  campaign_name: "по названию кампании",
};

export const EMPTY_FUNNEL: FunnelAssignment = { alias: null, source: null, share: null, others: [] };

/** Воронка из ссылки: последний сегмент пути, в нижнем регистре */
export function funnelFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop();
    return seg ? decodeURIComponent(seg).toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Главная воронка по ссылкам креативов кампании: ссылка → расход */
export function funnelFromUrls(urls: Map<string, number> | undefined): string | null {
  if (!urls) return null;
  const bySpend = new Map<string, number>();
  for (const [url, spend] of urls) {
    const f = funnelFromUrl(url);
    if (f) bySpend.set(f, (bySpend.get(f) ?? 0) + spend);
  }
  return [...bySpend].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Самая длинная известная воронка, которая встречается в названии кампании */
export function funnelFromName(name: string | undefined, known: Iterable<string>): string | null {
  const n = name?.toLowerCase();
  if (!n) return null;
  let best: string | null = null;
  for (const a of known) if (a.length >= 5 && n.includes(a) && (!best || a.length > best.length)) best = a;
  return best;
}

/** Собирает воронку кампании из источников в порядке приоритета */
export function assignFunnel(split: FunnelShare[] | undefined, urlFunnel: string | null, nameFunnel: string | null): FunnelAssignment {
  if (split?.length) return { alias: split[0].alias, source: "posthog", share: split[0].share, others: split.slice(1) };
  if (urlFunnel) return { alias: urlFunnel, source: "creative_url", share: null, others: [] };
  if (nameFunnel) return { alias: nameFunnel, source: "campaign_name", share: null, others: [] };
  return EMPTY_FUNNEL;
}

/** Значение ?funnel= из ссылки: алиас воронки или NO_FUNNEL */
export function parseFunnelParam(v: string | undefined): string | null {
  const s = v?.trim().toLowerCase();
  return s && /^[a-z0-9._-]{1,80}$/.test(s) ? s : null;
}

export const sharePct = (v: number) => (v < 0.01 ? "<1%" : `${Math.round(v * 100)}%`);

/** Подсказка к воронке кампании: откуда взята, доля главной и остальные воронки */
export function funnelHint(f: FunnelAssignment): string {
  if (!f.alias || !f.source) return "Воронка не определена";
  const main = `Воронка ${f.alias} — ${FUNNEL_SOURCE_LABEL[f.source]}${f.share !== null ? `, ${sharePct(f.share)} посетителей` : ""}`;
  const rest = f.others.map((o) => `${o.alias} ${sharePct(o.share)}`).join(", ");
  return rest ? `${main}. Ещё: ${rest}` : main;
}

export const funnelTitle = (key: string) => (key === NO_FUNNEL ? "воронка не определена" : key);

export const matchesFunnel =(alias: string | null | undefined, filter: string | null) => !filter || (filter === NO_FUNNEL ? !alias : alias === filter);

export interface FunnelOption {
  key: string;
  count: number;
  spend: number;
}

/** Пункты фильтра: воронки по расходу, «не определена» — в конце; выбранная воронка остаётся в списке, даже если в срезе её нет */
export function funnelOptions<T>(rows: T[], aliasOf: (r: T) => string | null | undefined, spendOf: (r: T) => number, selected: string | null): FunnelOption[] {
  const by = new Map<string, FunnelOption>();
  for (const r of rows) {
    const key = aliasOf(r) || NO_FUNNEL;
    const o = by.get(key) ?? { key, count: 0, spend: 0 };
    o.count++;
    o.spend += spendOf(r);
    by.set(key, o);
  }
  if (selected && !by.has(selected)) by.set(selected, { key: selected, count: 0, spend: 0 });
  return [...by.values()].sort((a, b) => Number(a.key === NO_FUNNEL) - Number(b.key === NO_FUNNEL) || b.spend - a.spend || b.count - a.count || a.key.localeCompare(b.key));
}
