import { NextResponse } from "next/server";
import { defaultRange, evaluateCached, isLiveMode } from "@/lib/evaluate";

export async function GET() {
  const r = defaultRange();
  const data = await evaluateCached(r.dateFrom, r.dateTo);
  return NextResponse.json({ ok: true, mode: isLiveMode() ? "live" : "demo", effectiveMode: data.mode, sources: data.sources, campaigns: data.campaigns.length });
}
