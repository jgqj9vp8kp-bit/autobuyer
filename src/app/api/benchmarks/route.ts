import { NextRequest, NextResponse } from "next/server";
import { getBenchmarks } from "@/lib/benchmarks";
import { loadAllConfigs } from "@/lib/configStore";
import { defaultRange, isLiveMode, sourcesConfig } from "@/lib/evaluate";
import { DEFAULT_PRODUCT } from "@/lib/products";

/** GET /api/benchmarks?to=YYYY-MM-DD — бенчмарки сегментов (продукт × гео) за 60 дней до `to`. */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") ?? defaultRange().dateTo;
  const src = sourcesConfig();
  if (!isLiveMode() || !src.capsuled) return NextResponse.json({ error: "Бенчмарки доступны только в live-режиме с настроенным дашбордом" }, { status: 400 });
  const configs = await loadAllConfigs();
  const set = await getBenchmarks({ capsuled: src.capsuled, posthog: src.posthog }, to, (p) => configs[p ?? DEFAULT_PRODUCT].targetCpa);
  return NextResponse.json(set);
}
