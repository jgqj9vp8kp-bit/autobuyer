import type { AdCampaignStats, DailyAdStats } from "@/lib/types";

/**
 * Клиент дашборда баеров «FB Ads Ops» (capsuled.space, GET /api/external/v1/fb-stats).
 *
 * Схема ответа (подтверждена 2026-10-28):
 *   { ok, version:"v1", source:"facebook", range:{dateFrom,dateTo}, level, currency:"USD",
 *     dataFreshness:{fbStatsTo,lastImportAt}, rowCount, totalRows, truncated, limit, notes[], rows[] }
 * При includeDaily=true каждая строка rows — ОДНА кампания за ОДИН день:
 *   date, adAccountId, adAccountName, buyer, campaignId, campaignName, spend, fbPurchases (канонические
 *   покупки Meta), cpp, impressions, clicks, ctr, cpc, cpm, reach, frequency, linkClicks, landingPageViews,
 *   registrations, actions[{action_type,value}], … (статуса кампании и гео в ответе нет).
 * Здесь дневные строки агрегируются по campaignId в AdCampaignStats + daily[]. Маппер остаётся
 * толерантным к альтернативным именам полей и к форме «одна строка на кампанию с вложенным daily».
 */

export interface CapsuledOptions {
  baseUrl: string;
  apiKey: string;
}

export interface CapsuledMeta {
  fbStatsTo?: string;
  lastImportAt?: string;
  totalRows?: number;
  truncated?: boolean;
  currency?: string;
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

const ID_KEYS = ["campaignId", "campaign_id", "fbCampaignId", "id"];
const DATE_KEYS = ["date", "day", "date_start", "dateStart"];
const SPEND_KEYS = ["spend", "cost", "amountSpent", "amount_spent", "totalSpend"];
const IMPR_KEYS = ["impressions", "imps"];
const CLICK_KEYS = ["clicks", "clicksAll", "linkClicks", "link_clicks", "inline_link_clicks"];
const PURCHASE_KEYS = ["fbPurchases", "purchases", "results", "conversions", "trials", "purchase"];
const REVENUE_KEYS = ["revenue", "purchaseConversionValue", "purchaseValue", "purchase_value", "conversionValue"];

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

const str = (v: unknown): string | undefined => (v === undefined || v === null || v === "" ? undefined : String(v));

function dailyFromRow(r: AnyRecord): DailyAdStats | null {
  const date = str(pick(r, DATE_KEYS));
  if (!date) return null;
  return {
    date: date.slice(0, 10),
    spend: num(pick(r, SPEND_KEYS)),
    impressions: num(pick(r, IMPR_KEYS)),
    clicks: num(pick(r, CLICK_KEYS)),
    purchases: num(pick(r, PURCHASE_KEYS)),
    revenue: num(pick(r, REVENUE_KEYS)),
  };
}

function normalizeStatus(v: unknown): AdCampaignStats["status"] | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).toUpperCase();
  if (s.includes("ACTIVE") || s === "RUNNING") return "ACTIVE";
  if (s.includes("PAUSE")) return "PAUSED";
  if (s.includes("ARCHIV") || s.includes("DELETE")) return "ARCHIVED";
  return "UNKNOWN";
}

/**
 * Собирает одну кампанию из её строк (дневных или одной сводной).
 * Своего поля статуса в API нет, поэтому статус выводится по открутке: `latestActiveDate` — последний день,
 * за который хоть у одной кампании есть показы или расход. Кампания с откруткой в этот день — ACTIVE,
 * с откруткой только раньше — INACTIVE, без открутки вовсе — UNKNOWN.
 */
function aggregateCampaign(campaignId: string, rows: AnyRecord[], latestActiveDate: string | undefined): AdCampaignStats {
  const first = rows[0];
  const nested = rows.length === 1 ? pick(first, ["daily", "days", "dailyStats", "byDay"]) : undefined;
  const daily = (Array.isArray(nested) ? nested.map((x) => dailyFromRow(x as AnyRecord)) : rows.map(dailyFromRow))
    .filter((d): d is DailyAdStats => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const fromDaily = daily.length > 0 && !nested;
  const sum = (f: (d: DailyAdStats) => number) => daily.reduce((s, d) => s + f(d), 0);

  const spend = fromDaily ? sum((d) => d.spend) : num(pick(first, SPEND_KEYS));
  const impressions = fromDaily ? sum((d) => d.impressions) : num(pick(first, IMPR_KEYS));
  const clicks = fromDaily ? sum((d) => d.clicks) : num(pick(first, CLICK_KEYS));
  const purchases = fromDaily ? sum((d) => d.purchases) : num(pick(first, PURCHASE_KEYS));
  const revenue = fromDaily ? sum((d) => d.revenue) : num(pick(first, REVENUE_KEYS));
  const reachRaw = fromDaily ? rows.reduce((s, r) => s + num(pick(r, ["reach"])), 0) : num(pick(first, ["reach"]));
  const reach = reachRaw > 0 ? reachRaw : undefined;

  // Имя/баер/аккаунт — из самой свежей строки (кампанию могли переименовать)
  const latestRow = rows.reduce((a, b) => (String(pick(b, DATE_KEYS) ?? "") >= String(pick(a, DATE_KEYS) ?? "") ? b : a), first);
  const explicitStatus = normalizeStatus(pick(latestRow, ["status", "effectiveStatus", "effective_status", "campaignStatus"]));
  const lastActiveDate = [...daily].reverse().find((d) => d.spend > 0 || d.impressions > 0)?.date;
  const derivedStatus: AdCampaignStats["status"] = !lastActiveDate ? "UNKNOWN" : latestActiveDate && lastActiveDate >= latestActiveDate ? "ACTIVE" : "INACTIVE";

  return {
    campaignId,
    campaignName: String(pick(latestRow, ["campaignName", "campaign_name", "name"]) ?? campaignId),
    accountId: str(pick(latestRow, ["adAccountId", "accountId", "account_id"])),
    accountName: str(pick(latestRow, ["adAccountName", "accountName", "account_name"])),
    buyer: str(pick(latestRow, ["buyer", "buyerName", "user", "userName", "owner", "manager"])),
    status: explicitStatus ?? derivedStatus,
    lastActiveDate,
    objective: str(pick(latestRow, ["objective"])),
    geo: str(pick(latestRow, ["geo", "country", "countries"])),
    spend,
    impressions,
    clicks,
    reach,
    frequency: reach ? impressions / reach : undefined,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    purchases,
    revenue,
    cpa: purchases > 0 ? spend / purchases : null,
    roas: spend > 0 && revenue > 0 ? revenue / spend : null,
    daily,
    // Полные строки (с массивами actions) не тащим в ответ: они уходят на клиент вместе с таблицей
    raw: { source: "capsuled", rows: rows.length, dateFrom: daily[0]?.date, dateTo: daily[daily.length - 1]?.date },
  };
}

/** Нормализует строки ответа дашборда (дневные или сводные) в список кампаний. */
export function mapCapsuledRows(rows: AnyRecord[]): AdCampaignStats[] {
  const groups = new Map<string, AnyRecord[]>();
  let latestActiveDate: string | undefined;
  for (const r of rows) {
    const id = str(pick(r, ID_KEYS));
    if (!id) continue;
    const g = groups.get(id);
    if (g) g.push(r);
    else groups.set(id, [r]);
    const d = str(pick(r, DATE_KEYS))?.slice(0, 10);
    const active = num(pick(r, SPEND_KEYS)) > 0 || num(pick(r, IMPR_KEYS)) > 0;
    if (d && active && (!latestActiveDate || d > latestActiveDate)) latestActiveDate = d;
  }
  return [...groups].map(([id, rs]) => aggregateCampaign(id, rs, latestActiveDate));
}

/** Достаёт массив строк из ответа любой из типичных форм. */
export function extractRows(payload: unknown): AnyRecord[] {
  if (Array.isArray(payload)) return payload as AnyRecord[];
  if (payload && typeof payload === "object") {
    const o = payload as AnyRecord;
    for (const k of ["rows", "data", "items", "campaigns", "results", "stats"]) {
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

function extractMeta(payload: unknown): CapsuledMeta {
  if (!payload || typeof payload !== "object") return {};
  const o = payload as AnyRecord;
  const fresh = (o.dataFreshness ?? {}) as AnyRecord;
  return {
    fbStatsTo: str(fresh.fbStatsTo),
    lastImportAt: str(fresh.lastImportAt),
    totalRows: o.totalRows !== undefined ? num(o.totalRows) : undefined,
    truncated: o.truncated === true,
    currency: str(o.currency),
  };
}

export async function fetchCampaignStats(opts: CapsuledOptions, dateFrom: string, dateTo: string): Promise<{ campaigns: AdCampaignStats[]; raw: unknown; meta: CapsuledMeta }> {
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
  return { campaigns: mapCapsuledRows(extractRows(body)), raw: body, meta: extractMeta(body) };
}
