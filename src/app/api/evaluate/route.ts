import { NextRequest, NextResponse } from "next/server";
import { defaultRange, evaluateCached } from "@/lib/evaluate";

/** GET /api/evaluate?from=YYYY-MM-DD&to=YYYY-MM-DD&refresh=1 — оценка всех кампаний. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const def = defaultRange();
  const from = sp.get("from") ?? def.dateFrom;
  const to = sp.get("to") ?? def.dateTo;
  const data = await evaluateCached(from, to, sp.get("refresh") === "1");
  return NextResponse.json(data);
}

/** Vercel: лимит времени функции (бенчмарки и воронки за длинный период) */
export const maxDuration = 60;
