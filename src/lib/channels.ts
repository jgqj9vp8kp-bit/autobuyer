import type { AdCampaignStats, Channel } from "@/lib/types";

/**
 * Канал трафика кампании. Данные по каналам не смешиваются: дашборд баеров знает только Facebook,
 * Google Ads и TikTok известны лишь по воронке PostHog (utm_source), расхода по ним нет.
 */
export const CHANNELS: Array<{ key: Channel; label: string; hint: string }> = [
  { key: "facebook", label: "Facebook", hint: "кампании из FB-дашборда и трафик с utm_source FB/IG (коды 4, 22, 19, int3, fb, ig)" },
  { key: "google", label: "Google Ads", hint: "utm_source=google / googlemail; расхода в дашборде нет" },
  { key: "tiktok", label: "TikTok", hint: "utm_source=tiktok / tt; расхода в дашборде нет" },
  { key: "other", label: "Другое", hint: "источник не распознан" },
];
export const CHANNEL_KEYS: Channel[] = CHANNELS.map((c) => c.key);
export const CHANNEL_LABEL: Record<Channel, string> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.label])) as Record<Channel, string>;
export const DEFAULT_CHANNEL: Channel = "facebook";
export const isChannel = (v: unknown): v is Channel => typeof v === "string" && (CHANNEL_KEYS as string[]).includes(v);

/** Канал по utm_source (коды 4/22/19/int3 — так баеры помечают FB/IG). */
export function channelFromUtmSource(utmSource?: string | null): Channel | null {
  const s = (utmSource ?? "").toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith("google") || s === "gmail" || s === "youtube") return "google";
  if (s.includes("tiktok") || s === "tt") return "tiktok";
  if (/^(fb|ig|facebook|instagram|meta|an|int\d*|\d+)$/.test(s)) return "facebook";
  return "other";
}

/** Канал кампании: всё, что есть в FB-дашборде — Facebook; остальное по utm_source и по виду id. */
export function channelOf(ad: Pick<AdCampaignStats, "campaignId" | "statsSource" | "utmSource">): Channel {
  if (ad.statsSource === "capsuled" || ad.statsSource === "demo") return "facebook";
  const byUtm = channelFromUtmSource(ad.utmSource);
  if (byUtm) return byUtm;
  return /^\d{12,}$/.test(ad.campaignId) ? "facebook" : "other";
}

/** Человекочитаемый источник трафика для подписи у кампаний без данных дашборда. */
export function trafficSourceLabel(utmSource?: string | null): string {
  const ch = channelFromUtmSource(utmSource);
  if (!ch) return "источник неизвестен";
  if (ch === "facebook") return "Facebook/Instagram";
  if (ch === "other") return utmSource as string;
  return CHANNEL_LABEL[ch];
}
