import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/defaultConfig";
import { DEFAULT_PRODUCT, PRODUCT_KEYS } from "@/lib/products";
import type { ProductKey, ScoringConfig } from "@/lib/types";

/**
 * Конфиг скоринга хранится отдельно для каждого продукта.
 *
 * Два хранилища:
 *  - Redis через REST (Upstash / Vercel KV): включается, если заданы KV_REST_API_URL + KV_REST_API_TOKEN
 *    (или UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Нужен на serverless-хостингах (Vercel),
 *    где файловая система не сохраняется между запросами.
 *  - Файлы data/scoring-config.<product>.json (DATA_DIR) — локально и в Docker с томом.
 * Если файла продукта нет, берётся общий data/scoring-config.json (конфиг до разделения по продуктам),
 * а если нет и его — значения по умолчанию.
 */
const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
const LEGACY_PATH = path.join(DATA_DIR, "scoring-config.json");
const configPath = (product: ProductKey) => path.join(DATA_DIR, `scoring-config.${product}.json`);

const KV_PREFIX = "autobuyer:config:";

function kvConfig(): { url: string; token: string } | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function kvGet(key: string): Promise<string | null> {
  const kv = kvConfig();
  if (!kv) return null;
  const res = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${kv.token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`KV GET ${key}: HTTP ${res.status}`);
  const body = (await res.json()) as { result: string | null };
  return body.result ?? null;
}

async function kvSet(key: string, value: string): Promise<void> {
  const kv = kvConfig();
  if (!kv) return;
  const res = await fetch(`${kv.url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kv.token}`, "Content-Type": "text/plain" },
    body: value,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV SET ${key}: HTTP ${res.status}`);
}

/** Какое хранилище используется — для страницы «Источники». */
export function storageInfo(): { kind: "kv" | "files"; detail: string } {
  const kv = kvConfig();
  return kv ? { kind: "kv", detail: new URL(kv.url).host } : { kind: "files", detail: DATA_DIR };
}

async function readJson(file: string): Promise<Partial<ScoringConfig> | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Partial<ScoringConfig>;
  } catch {
    return null;
  }
}

/** Мягкая миграция: добавляем недостающие поля из дефолта. */
const withDefaults = (parsed: Partial<ScoringConfig>): ScoringConfig => ({
  ...DEFAULT_SCORING_CONFIG,
  ...parsed,
  verdicts: { ...DEFAULT_SCORING_CONFIG.verdicts, ...(parsed.verdicts ?? {}) },
});

export async function loadConfig(product: ProductKey = DEFAULT_PRODUCT): Promise<ScoringConfig> {
  if (kvConfig()) {
    const raw = await kvGet(KV_PREFIX + product);
    return raw ? withDefaults(JSON.parse(raw) as Partial<ScoringConfig>) : DEFAULT_SCORING_CONFIG;
  }
  const own = await readJson(configPath(product));
  if (own) return withDefaults(own);
  const legacy = await readJson(LEGACY_PATH);
  if (legacy) return withDefaults(legacy);
  return DEFAULT_SCORING_CONFIG;
}

export async function loadAllConfigs(): Promise<Record<ProductKey, ScoringConfig>> {
  const entries = await Promise.all(PRODUCT_KEYS.map(async (p) => [p, await loadConfig(p)] as const));
  return Object.fromEntries(entries) as Record<ProductKey, ScoringConfig>;
}

export async function saveConfig(product: ProductKey, cfg: ScoringConfig): Promise<ScoringConfig> {
  const next = { ...cfg, updatedAt: new Date().toISOString() };
  if (kvConfig()) {
    await kvSet(KV_PREFIX + product, JSON.stringify(next));
    return next;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(configPath(product), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function resetConfig(product: ProductKey): Promise<ScoringConfig> {
  return saveConfig(product, { ...DEFAULT_SCORING_CONFIG, version: DEFAULT_SCORING_CONFIG.version + 1 });
}

/** Сохраняет сырой ответ источника для отладки маппинга (только при файловом хранилище). */
export async function cacheRaw(name: string, payload: unknown): Promise<void> {
  if (kvConfig()) return;
  try {
    const dir = path.join(DATA_DIR, "cache");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* не критично (например, read-only файловая система) */
  }
}
