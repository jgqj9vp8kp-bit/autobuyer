import type { FunnelCounts, FunnelStepDef } from "@/lib/types";

/**
 * Клиент PostHog: считает уникальных пользователей на каждом шаге воронки
 * в разрезе кампаний через HogQL (POST /api/projects/:id/query).
 *
 * Привязка пользователя к кампании — через свойство события `utm_campaign`
 * (или `$initial_utm_campaign` персоны). Ожидается, что баеры ставят в ссылку
 * utm_campaign={{campaign.id}}; если используется другой параметр — поменяйте
 * `campaignProperty` в env POSTHOG_CAMPAIGN_PROPERTY.
 */

export interface PostHogOptions {
  host: string;
  projectId: string;
  apiKey: string;
  /** HogQL-выражение, по которому группируем, по умолчанию coalesce(properties.utm_campaign, person.properties.$initial_utm_campaign) */
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

/** Строит HogQL: для каждого шага — countDistinct(person_id) по кампаниям. */
export function buildFunnelQuery(funnel: FunnelStepDef[], dateFrom: string, dateTo: string, campaignExpr: string): string {
  const stepExprs = funnel.map((s) => {
    const cond = [`event = '${escapeStr(s.event)}'`];
    if (s.property) cond.push(`toString(properties.${s.property.name}) = '${escapeStr(s.property.value)}'`);
    return `countDistinctIf(person_id, ${cond.join(" AND ")}) AS ${s.key}`;
  });
  const events = [...new Set(funnel.map((s) => `'${escapeStr(s.event)}'`))].join(", ");
  return `
SELECT toString(${campaignExpr}) AS campaign, ${stepExprs.join(", ")}
FROM events
WHERE event IN (${events})
  AND timestamp >= toDateTime('${dateFrom} 00:00:00')
  AND timestamp <= toDateTime('${dateTo} 23:59:59')
  AND campaign != ''
GROUP BY campaign
ORDER BY ${funnel[0]?.key ?? "campaign"} DESC
LIMIT 5000`.trim();
}

export async function fetchFunnelCounts(opts: PostHogOptions, funnel: FunnelStepDef[], dateFrom: string, dateTo: string): Promise<FunnelCounts[]> {
  const campaignExpr = opts.campaignExpr ?? "coalesce(properties.utm_campaign, person.properties.$initial_utm_campaign, '')";
  const query = buildFunnelQuery(funnel, dateFrom, dateTo, campaignExpr);
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
  const cols = data.columns ?? ["campaign", ...funnel.map((s) => s.key)];
  const out: FunnelCounts[] = [];
  for (const row of data.results ?? []) {
    const rec: Record<string, unknown> = {};
    cols.forEach((c, i) => (rec[c] = row[i]));
    const campaignId = String(rec.campaign ?? "");
    if (!campaignId) continue;
    const steps: Record<string, number> = {};
    for (const s of funnel) steps[s.key] = Number(rec[s.key] ?? 0);
    out.push({ campaignId, steps });
  }
  return out;
}
