import type { AdCampaignStats } from "@/lib/types";

export const fmtMoney = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const fmtPct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(digits)}%`);

export const fmtNum = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

export const fmtCompact = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

/** Сдвиг даты YYYY-MM-DD на n дней (UTC). */
export const addDaysIso = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const fmtDate = (iso: string) => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
};

/** Человекочитаемый статус кампании (у дашборда своего статуса нет, он выводится по открутке). */
export function fmtStatus(ad: Pick<AdCampaignStats, "status" | "lastActiveDate">): string {
  const last = ad.lastActiveDate ? fmtDate(ad.lastActiveDate) : null;
  switch (ad.status) {
    case "ACTIVE":
      return last ? `крутится (открутка ${last})` : "крутится";
    case "INACTIVE":
      return last ? `не крутится, последняя открутка ${last}` : "не крутится";
    case "PAUSED":
      return "на паузе";
    case "ARCHIVED":
      return "в архиве";
    default:
      return "статус неизвестен";
  }
}
