import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/defaultConfig";
import { DEFAULT_PRODUCT, PRODUCT_KEYS } from "@/lib/products";
import type { ProductKey, ScoringConfig } from "@/lib/types";

/**
 * Конфиг скоринга хранится отдельно для каждого продукта: data/scoring-config.<product>.json.
 * Если файла продукта нет, берётся общий data/scoring-config.json (конфиг до разделения по продуктам),
 * а если нет и его — значения по умолчанию.
 */
// DATA_DIR — куда писать конфиги и кеш; в Docker это примонтированный том (/data), иначе ./data
const DATA_DIR = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
const LEGACY_PATH = path.join(DATA_DIR, "scoring-config.json");
const configPath = (product: ProductKey) => path.join(DATA_DIR, `scoring-config.${product}.json`);

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
  await fs.mkdir(DATA_DIR, { recursive: true });
  const next = { ...cfg, updatedAt: new Date().toISOString() };
  await fs.writeFile(configPath(product), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function resetConfig(product: ProductKey): Promise<ScoringConfig> {
  return saveConfig(product, { ...DEFAULT_SCORING_CONFIG, version: DEFAULT_SCORING_CONFIG.version + 1 });
}

/** Сохраняет сырой ответ источника для отладки маппинга. */
export async function cacheRaw(name: string, payload: unknown): Promise<void> {
  try {
    const dir = path.join(DATA_DIR, "cache");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(payload, null, 2), "utf8");
  } catch {
    /* не критично */
  }
}
