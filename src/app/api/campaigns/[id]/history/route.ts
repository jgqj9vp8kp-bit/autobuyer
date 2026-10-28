import { NextRequest, NextResponse } from "next/server";
import { defaultRange, evaluateCached } from "@/lib/evaluate";
import { scoreHistoryCached } from "@/lib/history";

/** GET /api/campaigns/:id/history?to=YYYY-MM-DD&days=14&window=7 — скор по дням (скользящее окно). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId);
  const sp = req.nextUrl.searchParams;
  const def = defaultRange();
  const to = sp.get("to") ?? def.dateTo;
  const days = Math.min(90, Math.max(3, Number(sp.get("days") ?? 14)));
  const windowDays = Math.min(30, Math.max(1, Number(sp.get("window") ?? 7)));
  const data = await evaluateCached(sp.get("from") ?? def.dateFrom, to);
  const row = data.campaigns.find((c) => c.ad.campaignId === id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await scoreHistoryCached(row.ad, to, days, windowDays, row.product));
}
