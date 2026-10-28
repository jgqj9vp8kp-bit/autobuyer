import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/defaultConfig";
import type { ScoringConfig } from "@/lib/types";

/** Конфиг скоринга хранится в data/scoring-config.json (создаётся при первом обращении). */
const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "scoring-config.json");

export async function loadConfig(): Promise<ScoringConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as ScoringConfig;
    // Мягкая миграция: добавляем недостающие поля из дефолта
    return { ...DEFAULT_SCORING_CONFIG, ...parsed, verdicts: { ...DEFAULT_SCORING_CONFIG.verdicts, ...(parsed.verdicts ?? {}) } };
  } catch {
    return DEFAULT_SCORING_CONFIG;
  }
}

export async function saveConfig(cfg: ScoringConfig): Promise<ScoringConfig> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const next = { ...cfg, updatedAt: new Date().toISOString() };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function resetConfig(): Promise<ScoringConfig> {
  return saveConfig({ ...DEFAULT_SCORING_CONFIG, version: DEFAULT_SCORING_CONFIG.version + 1 });
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
