import type { FunnelCounts, FunnelStepDef } from "@/lib/types";

/**
 * Клиент PostHog: считает уникальных пользователей на каждом шаге воронки
 * в разрезе кампаний через HogQL (POST /api/projects/:id/query).
 *
 * Привязка пользователя к кампании — через свойство события `utm_campaign`
 * (или `$initial_utm_campaign` персоны). Ожидается, что баеры ставят в ссылку
 * utm_campaign={{campaign.id}}; если используется другой параметр — поменяйте
 * выражение в env POSTHOG_CAMPAIGN_EXPR.
 */

export interface PostHogOptions {
  host: string;
  projectId: string;
  apiKey: string;
  /** HogQL-выражение, по которому группируем; по умолчанию DEFAULT_CAMPAIGN_EXPR */
  campaignExpr?: string;
}

export class PostHogError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

const escapeStr = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const ident = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_");

/**
 * Привязка события к кампании. События воронки несут utm_campaign сами, но события покупки
 * апсейлов (upsell_purchase_success) приходят уже без utm — для них берём $initial_utm_campaign персоны.
 */
export const DEFAULT_CAMPAIGN_EXPR = "coalesce(nullIf(toString(properties.utm_campaign), ''), nullIf(toString(person.properties.$initial_utm_campaign), ''), '')";

/**
 * Условие по свойству шага: без учёта регистра, несколько значений через `|`,
 * префикс `!` инвертирует ("!intro|intro_soulmate" → NOT IN).
 * `column` — выражение, из которого читаем значение (по умолчанию properties.<name>).
 */
export function propertyCondition(name: string, value: string, column?: string): string {
  const negate = value.startsWith("!");
  const values = (negate ? value.slice(1) : value)
    .split("|")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .map((v) => `'${escapeStr(v)}'`);
  if (!values.length) return "1";
  const col = column ?? `toString(properties.${ident(name)})`;
  return `lower(${col}) ${negate ? "NOT IN" : "IN"} (${values.join(", ")})`;
}

const stepCondition = (s: FunnelStepDef, column?: (name: string) => string) => {
  const cond = [`event = '${escapeStr(s.event)}'`];
  if (s.property?.name && s.property.value) cond.push(propertyCondition(s.property.name, s.property.value, column?.(s.property.name)));
  return cond.join(" AND ");
};

const eventList = (funnel: FunnelStepDef[]) => [...new Set(funnel.map((s) => `'${escapeStr(s.event)}'`))].join(", ");

/** Строит HogQL: для каждого шага — countDistinct(person_id) по кампаниям. */
export function buildFunnelQuery(funnel: FunnelStepDef[], dateFrom: string, dateTo: string, campaignExpr: string): string {
  const stepExprs = funnel.map((s) => `countDistinctIf(person_id, ${stepCondition(s)}) AS ${ident(s.key)}`);
  return `
SELECT toString(${campaignExpr}) AS campaign,
  anyIf(toString(properties.funnel_alias), toString(properties.funnel_alias) != '') AS funnel_alias,
  anyIf(toString(properties.$host), toString(properties.$host) != '') AS host,
  anyIf(toString(properties.utm_source), toString(properties.utm_source) != '') AS utm_source,
  ${stepExprs.join(",\n  ")}
FROM events
WHERE event IN (${eventList(funnel)})
  AND timestamp >= toDateTime('${dateFrom} 00:00:00')
  AND timestamp <= toDateTime('${dateTo} 23:59:59')
  AND campaign != ''
GROUP BY campaign
ORDER BY ${ident(funnel[0]?.key ?? "campaign")} DESC
LIMIT 5000`.trim();
}

/**
 * История одной кампании: для каждого дня `day` в [dateFrom, dateTo] — уникальные пользователи
 * на шагах за скользящее окно [day - windowDays + 1, day]. Реализовано через arrayJoin:
 * каждое событие «размножается» на все дни окна, в которые оно попадает.
 */
export function buildFunnelHistoryQuery(funnel: FunnelStepDef[], campaignId: string, dateFrom: string, dateTo: string, windowDays: number, campaignExpr: string): string {
  const props = [...new Set(funnel.map((s) => s.property?.name).filter((n): n is string => Boolean(n)))];
  const propCols = props.map((p) => `toString(properties.${ident(p)}) AS p_${ident(p)}`);
  const stepExprs = funnel.map((s) => `countDistinctIf(person_id, ${stepCondition(s, (n) => `p_${ident(n)}`)}) AS ${ident(s.key)}`);
  const from = new Date(dateFrom + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - (windowDays - 1));
  const rawFrom = from.toISOString().slice(0, 10);
  return `
SELECT wday AS day,
  ${stepExprs.join(",\n  ")}
FROM (
  SELECT person_id, event${propCols.length ? ", " + propCols.join(", ") : ""},
    arrayJoin(arrayMap(i -> addDays(toDate(timestamp), i), range(0, ${windowDays}))) AS wday
  FROM events
  WHERE ${campaignExpr} = '${escapeStr(campaignId)}'
    AND event IN (${eventList(funnel)})
    AND timestamp >= toDateTime('${rawFrom} 00:00:00')
    AND timestamp <= toDateTime('${dateTo} 23:59:59')
)
WHERE wday >= toDate('${dateFrom}') AND wday <= toDate('${dateTo}')
GROUP BY wday
ORDER BY wday`.trim();
}

async function runQuery(opts: PostHogOptions, query: string): Promise<{ columns: string[]; results: unknown[][] }> {
  const url = `${opts.host.replace(/\/$/, "")}/api/projects/${opts.projectId}/query/`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* text */
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "detail" in body ? String((body as Record<string, unknown>).detail) : `HTTP ${res.status}`;
    throw new PostHogError(msg, res.status, body);
  }
  const data = body as { columns?: string[]; results?: unknown[][] };
  return { columns: data.columns ?? [], results: data.results ?? [] };
}

const rowsToRecords = (columns: string[], results: unknown[][]) =>
  results.map((row) => {
    const rec: Record<string, unknown> = {};
    columns.forEach((c, i) => (rec[c] = row[i]));
    return rec;
  });

export async function fetchFunnelCounts(opts: PostHogOptions, funnel: FunnelStepDef[], dateFrom: string, dateTo: string): Promise<FunnelCounts[]> {
  const campaignExpr = opts.campaignExpr ?? DEFAULT_CAMPAIGN_EXPR;
  const { columns, results } = await runQuery(opts, buildFunnelQuery(funnel, dateFrom, dateTo, campaignExpr));
  const out: FunnelCounts[] = [];
  for (const rec of rowsToRecords(columns, results)) {
    const campaignId = String(rec.campaign ?? "");
    if (!campaignId) continue;
    const steps: Record<string, number> = {};
    for (const s of funnel) steps[s.key] = Number(rec[ident(s.key)] ?? 0);
    const alias = rec.funnel_alias ? String(rec.funnel_alias) : undefined;
    const host = rec.host ? String(rec.host) : undefined;
    const utmSource = rec.utm_source ? String(rec.utm_source) : undefined;
    out.push({ campaignId, steps, funnelAlias: alias, host, utmSource });
  }
  return out;
}

export interface FunnelWindow {
  day: string; // YYYY-MM-DD — последний день окна
  steps: Record<string, number>;
}

export async function fetchFunnelHistory(
  opts: PostHogOptions,
  funnel: FunnelStepDef[],
  campaignId: string,
  dateFrom: string,
  dateTo: string,
  windowDays: number,
): Promise<FunnelWindow[]> {
  const campaignExpr = opts.campaignExpr ?? DEFAULT_CAMPAIGN_EXPR;
  const { columns, results } = await runQuery(opts, buildFunnelHistoryQuery(funnel, campaignId, dateFrom, dateTo, windowDays, campaignExpr));
  return rowsToRecords(columns, results).map((rec) => {
    const steps: Record<string, number> = {};
    for (const s of funnel) steps[s.key] = Number(rec[ident(s.key)] ?? 0);
    return { day: String(rec.day).slice(0, 10), steps };
  });
}

/** Домен воронки ($host) по кампаниям за период — для определения продукта в бенчмарках сегментов. */
export async function fetchCampaignHosts(opts: PostHogOptions, dateFrom: string, dateTo: string): Promise<Map<string, string>> {
  const campaignExpr = opts.campaignExpr ?? DEFAULT_CAMPAIGN_EXPR;
  const query = `
SELECT toString(${campaignExpr}) AS campaign,
  anyIf(toString(properties.$host), toString(properties.$host) != '') AS host
FROM events
WHERE event = 'funnel_screen_open'
  AND timestamp >= toDateTime('${dateFrom} 00:00:00')
  AND timestamp <= toDateTime('${dateTo} 23:59:59')
  AND campaign != ''
GROUP BY campaign
LIMIT 10000`.trim();
  const { columns, results } = await runQuery(opts, query);
  const out = new Map<string, string>();
  for (const rec of rowsToRecords(columns, results)) if (rec.campaign && rec.host) out.set(String(rec.campaign), String(rec.host));
  return out;
}
