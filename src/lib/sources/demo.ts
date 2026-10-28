import type { AdCampaignStats, DailyAdStats, FunnelCounts, FunnelStepDef } from "@/lib/types";

/**
 * Детерминированные демо-данные: 14 кампаний разного качества,
 * чтобы дашборд работал без ключей и показывал весь диапазон вердиктов.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Profile {
  name: string;
  buyer: string;
  geo: string;
  status: AdCampaignStats["status"];
  quality: number; // 0..1 — общее качество кампании
  dailySpend: number;
  trend: number; // -1 улучшается, +1 ухудшается
  upsell2: boolean;
}

const PROFILES: Profile[] = [
  { name: "US | Quiz v7 | Women 35+ | Broad", buyer: "Anna", geo: "US", status: "ACTIVE", quality: 0.92, dailySpend: 1800, trend: -0.3, upsell2: true },
  { name: "US | Quiz v7 | LAL 1% purchasers", buyer: "Anna", geo: "US", status: "ACTIVE", quality: 0.84, dailySpend: 1200, trend: -0.1, upsell2: true },
  { name: "UK | Quiz v6 | Interests fitness", buyer: "Dmitry", geo: "UK", status: "ACTIVE", quality: 0.71, dailySpend: 700, trend: 0.1, upsell2: true },
  { name: "CA | Quiz v7 | Advantage+ | UGC hook 3", buyer: "Dmitry", geo: "CA", status: "ACTIVE", quality: 0.66, dailySpend: 550, trend: 0.0, upsell2: false },
  { name: "AU | Quiz v5 | Broad | Static creatives", buyer: "Olga", geo: "AU", status: "ACTIVE", quality: 0.55, dailySpend: 400, trend: 0.25, upsell2: false },
  { name: "US | Quiz v7 | Men 25-44 | Test", buyer: "Olga", geo: "US", status: "ACTIVE", quality: 0.48, dailySpend: 350, trend: 0.4, upsell2: true },
  { name: "DE | Quiz v6 DE | Broad", buyer: "Anna", geo: "DE", status: "ACTIVE", quality: 0.42, dailySpend: 600, trend: 0.3, upsell2: false },
  { name: "US | Landing long | Retargeting 30d", buyer: "Max", geo: "US", status: "ACTIVE", quality: 0.78, dailySpend: 250, trend: -0.2, upsell2: true },
  { name: "FR | Quiz v6 FR | LAL 3%", buyer: "Max", geo: "FR", status: "ACTIVE", quality: 0.33, dailySpend: 450, trend: 0.5, upsell2: false },
  { name: "US | Quiz v8 beta | Broad", buyer: "Max", geo: "US", status: "ACTIVE", quality: 0.6, dailySpend: 120, trend: -0.4, upsell2: true },
  { name: "BR | Quiz v6 PT | Broad", buyer: "Olga", geo: "BR", status: "PAUSED", quality: 0.25, dailySpend: 300, trend: 0.6, upsell2: false },
  { name: "US | Quiz v7 | Women 55+ | Video", buyer: "Dmitry", geo: "US", status: "ACTIVE", quality: 0.88, dailySpend: 950, trend: -0.15, upsell2: true },
  { name: "ES | Quiz v6 ES | Interests", buyer: "Anna", geo: "ES", status: "PAUSED", quality: 0.38, dailySpend: 200, trend: 0.2, upsell2: false },
  { name: "US | Quiz v7 | TikTok-style hooks", buyer: "Max", geo: "US", status: "ACTIVE", quality: 0.73, dailySpend: 50, trend: 0.0, upsell2: true },
];

const CPM_BY_GEO: Record<string, number> = { US: 38, UK: 30, CA: 28, AU: 32, DE: 22, FR: 20, BR: 6, ES: 14 };

function* dateRange(from: string, to: string) {
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export interface DemoDailyFunnel {
  date: string;
  steps: Record<string, number>;
}

export function generateDemo(
  dateFrom: string,
  dateTo: string,
  funnel: FunnelStepDef[],
): { campaigns: AdCampaignStats[]; funnels: FunnelCounts[]; dailyFunnels: Record<string, DemoDailyFunnel[]> } {
  const campaigns: AdCampaignStats[] = [];
  const funnels: FunnelCounts[] = [];
  const dailyFunnels: Record<string, DemoDailyFunnel[]> = {};
  const dates = [...dateRange(dateFrom, dateTo)];
  const nDays = Math.max(1, dates.length);

  PROFILES.forEach((p, idx) => {
    const rnd = mulberry32(1000 + idx * 97);
    const campaignId = String(120210000000000 + idx * 1234567);
    const cpm = CPM_BY_GEO[p.geo] ?? 25;
    const ctr = 0.6 + p.quality * 1.6 + rnd() * 0.3; // %
    const daily: DailyAdStats[] = [];

    // Базовые конверсии воронки, зависящие от качества
    const q = p.quality;
    // Калибровка под реальные квиз-воронки: пэйвол→триал ≈ 4–20%, визит→триал ≈ 0.3–6%
    const firstScreen = 0.3 + q * 0.5; // 0.3..0.8
    const quizMid = 0.5 + q * 0.4;
    const email = 0.45 + q * 0.4;
    const paywall = 0.7 + q * 0.25;
    const checkout = 0.12 + q * 0.28;
    const trialFromCheckout = 0.18 + q * 0.3;
    const up1 = 0.04 + q * 0.32;
    const up2 = 0.05 + q * 0.28;

    const stepTotals: Record<string, number> = {};
    for (const s of funnel) stepTotals[s.key] = 0;
    const perDay: DemoDailyFunnel[] = [];

    dates.forEach((date, di) => {
      const spendNoise = 0.8 + rnd() * 0.4;
      const activeFactor = p.status === "PAUSED" && di > nDays - 3 ? 0 : 1;
      const spend = p.dailySpend * spendNoise * activeFactor;
      const impressions = Math.round((spend / cpm) * 1000);
      const clicks = Math.round(impressions * (ctr / 100));
      // Тренд: CPA ухудшается/улучшается к концу периода
      const t = nDays > 1 ? di / (nDays - 1) : 0;
      const trendFactor = 1 + p.trend * 0.35 * (t - 0.5);
      const visitors = Math.round(clicks * 0.82);
      const s1 = Math.round(visitors * firstScreen / trendFactor);
      const s2 = Math.round(s1 * quizMid);
      const s3 = Math.round(s2 * email);
      const s4 = Math.round(s3 * paywall);
      const s5 = Math.round(s4 * checkout);
      const trials = Math.round(s5 * trialFromCheckout / trendFactor);
      const u1 = Math.round(trials * up1);
      const u2 = p.upsell2 ? Math.round(u1 * up2) : 0;
      const revenue = trials * 9.99 + u1 * 29 + u2 * 19;

      daily.push({ date, spend: round2(spend), impressions, clicks, purchases: trials, revenue: round2(revenue) });

      const counts: Record<string, number> = {
        landing: visitors,
        quiz_start: s1,
        email_screen: s2,
        email: s3,
        paywall: s4,
        checkout: s5,
        trial: trials,
        upsell1: u1,
        upsell2: u2,
      };
      const daySteps: Record<string, number> = {};
      for (const s of funnel) {
        daySteps[s.key] = counts[s.key] ?? Math.round((counts.paywall ?? 0) * 0.5);
        stepTotals[s.key] += daySteps[s.key];
      }
      perDay.push({ date, steps: daySteps });
    });
    dailyFunnels[campaignId] = perDay;

    const spend = sum(daily.map((d) => d.spend));
    const impressions = sum(daily.map((d) => d.impressions));
    const clicks = sum(daily.map((d) => d.clicks));
    const purchases = sum(daily.map((d) => d.purchases));
    const revenue = sum(daily.map((d) => d.revenue));
    const reach = Math.round(impressions / (1.3 + (1 - q) * 2.2));

    campaigns.push({
      campaignId,
      campaignName: p.name,
      accountId: `act_${100000 + idx}`,
      accountName: `${p.buyer} · Account ${idx % 3 + 1}`,
      buyer: p.buyer,
      status: p.status,
      objective: "OUTCOME_SALES",
      geo: p.geo,
      spend: round2(spend),
      impressions,
      clicks,
      reach,
      frequency: round2(impressions / Math.max(1, reach)),
      ctr: round2(impressions > 0 ? (clicks / impressions) * 100 : 0),
      cpc: round2(clicks > 0 ? spend / clicks : 0),
      cpm: round2(impressions > 0 ? (spend / impressions) * 1000 : 0),
      purchases,
      revenue: round2(revenue),
      cpa: purchases > 0 ? round2(spend / purchases) : null,
      roas: spend > 0 ? round2(revenue / spend) : null,
      daily,
    });
    funnels.push({ campaignId, steps: stepTotals, funnelAlias: p.upsell2 ? "palm-reading-month-web" : "soulmate-month-web" });
  });

  return { campaigns, funnels, dailyFunnels };
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const round2 = (v: number) => Math.round(v * 100) / 100;
