import type { Verdict } from "@/lib/types";

export const VERDICT_META: Record<Verdict, { label: string; hint: string; cls: string; dot: string }> = {
  SCALE: { label: "Масштабировать", hint: "Скор высокий — увеличивайте бюджет", cls: "bg-success-soft text-success", dot: "bg-success" },
  KEEP: { label: "Держать", hint: "Работает в норме — наблюдайте", cls: "bg-accent-soft text-ink", dot: "bg-accent-deep" },
  OPTIMIZE: { label: "Оптимизировать", hint: "Есть проблемные зоны", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  PAUSE: { label: "Остановить", hint: "Скор низкий — стоп или перезапуск", cls: "bg-danger-soft text-danger", dot: "bg-danger" },
  NO_DATA: { label: "Нет данных", hint: "Недостаточно данных для оценки", cls: "bg-subtle text-muted", dot: "bg-muted" },
};

export const scoreColor = (score: number, grade: string) => {
  if (grade === "N/A") return "bg-subtle text-muted";
  if (score >= 75) return "bg-success text-white";
  if (score >= 55) return "bg-accent text-ink";
  if (score >= 35) return "bg-warn text-white";
  return "bg-danger text-white";
};

export const GROUP_LABEL: Record<string, string> = {
  funnel: "Воронка",
  monetization: "Монетизация",
  ads: "Реклама",
  quality: "Качество данных",
};
