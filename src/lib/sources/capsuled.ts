import type { AdCampaignStats, DailyAdStats } from "@/lib/types";

/**
 * Клиент дашборда баеров (capsuled.space, /api/external/v1/fb-stats).
 *
 * Точная схема ответа пока не подтверждена (ключ на момент разработки возвращал 401),
 * поэтому маппер толерантен к именам полей: ищет campaignId / campaign_id / id и т.п.
 * После первого успешного запроса сырой ответ сохраняется в data/cache/capsuled-last.json,
 * чтобы сверить маппинг.
 */

export interface CapsuledOptions {
  baseUrl: string;
  apiKey: string;
}

export class CapsuledError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

type AnyRecord = Record<string, unknown>;

const pick = (o: AnyRecord, keys: string[]): unknown => {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k];
  }
  return undefined;
};

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const str = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));

function mapDaily(rows: unknown): DailyAdStats[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => r as AnyRecord)
    .map((r) => ({
      date: String(pick(r, ["date", "day", "date_start", "dateStart"]) ?? ""),
      spend: num(pick(r, ["spend", "cost", "amountSpent", "amount_spent"])),
      impressions: num(pick(r, ["impressions", "imps"])),
      clicks: num(pick(r, ["clicks", "linkClicks", "link_clicks", "inline_link_clicks"])),
      purchases: num(pick(r, ["purchases", "conversions", "results", "trials", "purchase"])),
      revenue: num(pick(r, ["revenue", "purchaseValue", "purchase_value", "conversionValue"])),
    }))
    .filter((d) => d.date);
}

function normalizeStatus(v: unknown): AdCampaignStats["status"] {
  const s = String(v ?? "").toUpperCase();
  if (s.includes("ACTIVE") || s === "RUNNING") return "ACTIVE";
  if (s.includes("PAUSE")) return "PAUSED";
  if (s.includes("ARCHIV") || s.includes("DELETE")) return "ARCHIVED";
  return "UNKNOWN";
}

/** Нормализует одну строку ответа дашборда в AdCampaignStats. */
export function mapCapsuledRow(row: AnyRecord): AdCampaignStats {
  const campaignId = String(pick(row, ["campaignId", "campaign_id", "fbCampaignId", "id"]) ?? "");
  const spend = num(pick(row, ["spend", "cost", "amountSpent", "amount_spent", "totalSpend"]));
  const impressions = num(pick(row, ["impressions", "imps"]));
  const clicks = num(pick(row, ["clicks", "linkClicks", "link_clicks", "inline_link_clicks"]));
  const purchases = num(pick(row, ["purchases", "conversions", "results", "trials", "purchase"]));
  const revenue = num(pick(row, ["revenue", "purchaseValue", "purchase_value", "conversionValue"]));
  const reach = pick(row, ["reach"]);
  const freq = pick(row, ["frequency"]);
  const ctrRaw = pick(row, ["ctr"]);
  const cpcRaw = pick(row, ["cpc"]);
  const cpmRaw = pick(row, ["cpm"]);

  return {
    campaignId,
    campaignName: String(pick(row, ["campaignName", "campaign_name", "name"]) ?? campaignId),
    accountId: str(pick(row, ["accountId", "account_id", "adAccountId"])),
    accountName: str(pick(row, ["accountName", "account_name"])),
    buyer: str(pick(row, ["buyer", "buyerName", "user", "userName", "owner", "manager"])),
    status: normalizeStatus(pick(row, ["status", "effectiveStatus", "effective_status"])),
    objective: str(pick(row, ["objective"])),
    geo: str(pick(row, ["geo", "country", "countries"])),
    spend,
    impressions,
    clicks,
    reach: reach !== undefined ? num(reach) : undefined,
    frequency: freq !== undefined ? num(freq) : reach ? impressions / Math.max(1, num(reach)) : undefined,
    ctr: ctrRaw !== undefined ? num(ctrRaw) : impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: cpcRaw !== undefined ? num(cpcRaw) : clicks > 0 ? spend / clicks : 0,
    cpm: cpmRaw !== undefined ? num(cpmRaw) : impressions > 0 ? (spend / impressions) * 1000 : 0,
    purchases,
    revenue,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    daily: mapDaily(pick(row, ["daily", "days", "dailyStats", "byDay"])),
    raw: row,
  };
}

/** Достаёт массив строк из ответа любой из типичных форм. */
export function extractRows(payload: unknown): AnyRecord[] {
  if (Array.isArray(payload)) return payload as AnyRecord[];
  if (payload && typeof payload === "object") {
    const o = payload as AnyRecord;
    for (const k of ["data", "items", "rows", "campaigns", "results", "stats"]) {
      const v = o[k];
      if (Array.isArray(v)) return v as AnyRecord[];
      if (v && typeof v === "object") {
        const inner = extractRows(v);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

export async function fetchCampaignStats(opts: CapsuledOptions, dateFrom: string, dateTo: string): Promise<{ campaigns: AdCampaignStats[]; raw: unknown }> {
  const url = new URL(`${opts.baseUrl.replace(/\/$/, "")}/fb-stats`);
  url.searchParams.set("dateFrom", dateFrom);
  url.searchParams.set("dateTo", dateTo);
  url.searchParams.set("level", "campaign");
  url.searchParams.set("includeDaily", "true");
  url.searchParams.set("includeInactive", "true");
  url.searchParams.set("limit", "10000");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.apiKey}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* оставляем текст */
  }
  if (!res.ok) {
    const msg = body && typeof body === "object" && "message" in body ? String((body as AnyRecord).message) : `HTTP ${res.status}`;
    throw new CapsuledError(msg, res.status, body);
  }
  const rows = extractRows(body);
  const campaigns = rows.map(mapCapsuledRow).filter((c) => c.campaignId);
  return { campaigns, raw: body };
}
