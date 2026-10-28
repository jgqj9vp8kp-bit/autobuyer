import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadConfig, resetConfig, saveConfig } from "@/lib/configStore";
import { invalidateCache } from "@/lib/evaluate";

const Band = z.object({ value: z.number(), points: z.number().min(0) });
const Criterion = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  metric: z.string().min(1),
  maxPoints: z.number().min(0),
  group: z.enum(["funnel", "monetization", "ads", "quality"]),
  bands: z.array(Band).min(1),
  warnBelow: z.number().optional(),
  warnAbove: z.number().optional(),
  lowerIsBetter: z.boolean().optional(),
  enabled: z.boolean(),
  minSample: z.number().optional(),
});
const Step = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  event: z.string(),
  property: z.object({ name: z.string(), value: z.string() }).optional(),
  milestone: z.boolean().optional(),
  optional: z.boolean().optional(),
});
const Config = z.object({
  version: z.number(),
  updatedAt: z.string(),
  targetCpa: z.number().min(0),
  minVisitors: z.number().min(0),
  funnel: z.array(Step).min(1),
  criteria: z.array(Criterion),
  verdicts: z.object({ scale: z.number(), keep: z.number(), optimize: z.number() }),
});

export async function GET() {
  return NextResponse.json(await loadConfig());
}

export async function PUT(req: NextRequest) {
  const parsed = Config.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const saved = await saveConfig({ ...parsed.data, version: parsed.data.version + 1 } as Parameters<typeof saveConfig>[0]);
  invalidateCache();
  return NextResponse.json(saved);
}

export async function DELETE() {
  const cfg = await resetConfig();
  invalidateCache();
  return NextResponse.json(cfg);
}
