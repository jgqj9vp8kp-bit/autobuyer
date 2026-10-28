import type { AdCampaignStats, ProductKey, ProductSource } from "@/lib/types";

/**
 * Продукты, на которые льётся трафик. У каждого свои правила скоринга (data/scoring-config.<key>.json).
 *
 * Как кампания относится к продукту (по убыванию надёжности):
 *  1. домен воронки в PostHog — `$host` событий кампании (azora-astro.com / foxiq.app / robella.app);
 *  2. URL воронки в названии кампании («02 https://f.foxiq.app/test-iq?utm_source=4»);
 *  3. ключевые слова в названии кампании;
 *  4. ключевые слова в названии рекламного аккаунта.
 * Если ничего не подошло — продукт не определён, кампания считается по правилам DEFAULT_PRODUCT.
 */
export interface ProductDef {
  key: ProductKey;
  label: string;
  /** Домены воронок (сравниваются с $host и с URL в названии; поддомены учитываются) */
  hosts: string[];
  namePatterns: RegExp[];
  accountPatterns: RegExp[];
  hint: string;
}

export const PRODUCTS: ProductDef[] = [
  {
    key: "azora",
    label: "Azora",
    hosts: ["azora-astro.com"],
    namePatterns: [/azora|palm|soulmate|past[\s_-]?life|\bPR\b|\bSM\b|astro|zodiac|compat|calen|casar|hijos|amor|руки|hand/i],
    accountPatterns: [/azora|soulmate|past-?life|compit|compat/i],
    hint: "астро-воронки: palm reading, soulmate, past life",
  },
  {
    key: "foxiq",
    label: "Foxiq",
    hosts: ["foxiq.app", "brainza.app"],
    namePatterns: [/foxiq|\biq\b|iq[\s_-]?test|test[\s_-]?iq|autism|spe[ck]trum|brainza/i],
    accountPatterns: [/foxiq|\biq\b|brainza/i],
    hint: "IQ-тест",
  },
  {
    key: "robella",
    label: "Robella",
    hosts: ["robella.app"],
    namePatterns: [/robella|stylist|outfit|wardrobe/i],
    accountPatterns: [/robella|stylist/i],
    hint: "AI-стилист",
  },
];

export const PRODUCT_KEYS: ProductKey[] = PRODUCTS.map((p) => p.key);
export const DEFAULT_PRODUCT: ProductKey = "azora";
export const PRODUCT_LABEL: Record<ProductKey, string> = Object.fromEntries(PRODUCTS.map((p) => [p.key, p.label])) as Record<ProductKey, string>;

export const isProductKey = (v: unknown): v is ProductKey => typeof v === "string" && (PRODUCT_KEYS as string[]).includes(v);

export function productFromHost(host?: string | null): ProductKey | null {
  if (!host) return null;
  const h = host.toLowerCase();
  return PRODUCTS.find((p) => p.hosts.some((d) => h === d || h.endsWith(`.${d}`)))?.key ?? null;
}

export function productFromUrlInName(name: string): ProductKey | null {
  const m = name.match(/https?:\/\/([^/\s?]+)/i);
  return m ? productFromHost(m[1]) : null;
}

export function detectProduct(ad: Pick<AdCampaignStats, "campaignName" | "accountName">, host?: string | null): { product: ProductKey | null; source: ProductSource } {
  const byHost = productFromHost(host);
  if (byHost) return { product: byHost, source: "posthog" };
  const byUrl = productFromUrlInName(ad.campaignName);
  if (byUrl) return { product: byUrl, source: "name-url" };
  for (const p of PRODUCTS) if (p.namePatterns.some((re) => re.test(ad.campaignName))) return { product: p.key, source: "name" };
  if (ad.accountName) for (const p of PRODUCTS) if (p.accountPatterns.some((re) => re.test(ad.accountName as string))) return { product: p.key, source: "account" };
  return { product: null, source: "none" };
}

export const PRODUCT_SOURCE_LABEL: Record<ProductSource, string> = {
  posthog: "по домену воронки в PostHog",
  "name-url": "по URL в названии кампании",
  name: "по ключевым словам в названии",
  account: "по названию рекламного аккаунта",
  none: "не определён",
};
