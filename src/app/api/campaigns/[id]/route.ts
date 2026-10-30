import { NextRequest, NextResponse } from "next/server";
import { defaultRange, evaluateCached } from "@/lib/evaluate";

/** GET /api/campaigns/:id?from&to — оценка одной кампании. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  const id = decodeURIComponent(rawId);
  const sp = req.nextUrl.searchParams;
  const def = defaultRange();
  const data = await evaluateCached(sp.get("from") ?? def.dateFrom, sp.get("to") ?? def.dateTo);
  const row = data.campaigns.find((c) => c.ad.campaignId === id);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ...row, dateFrom: data.dateFrom, dateTo: data.dateTo, mode: data.mode });
}

/** Vercel: лимит времени функции (бенчмарки и воронки за длинный период) */
export const maxDuration = 60;
