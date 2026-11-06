import { NextRequest, NextResponse } from "next/server";
import { evaluateCreatives } from "@/lib/creatives";
import { defaultRange } from "@/lib/evaluate";

export const maxDuration = 60;

/** GET /api/creatives?from&to&campaign&adset&refresh=1 — креативы с воронкой и скором. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const def = defaultRange();
  return NextResponse.json(await evaluateCreatives(sp.get("from") ?? def.dateFrom, sp.get("to") ?? def.dateTo, { campaignId: sp.get("campaign") ?? undefined, adsetId: sp.get("adset") ?? undefined, force: Boolean(sp.get("refresh")) }));
}
