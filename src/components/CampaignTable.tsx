"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import type { CampaignEvaluation, Verdict } from "@/lib/types";
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtStatus } from "@/lib/format";
import { ScoreBadge, VerdictPill } from "@/components/ui";
import { PRODUCT_LABEL } from "@/lib/products";
import { VERDICT_META } from "@/lib/verdict";

type SortKey = "score" | "spend" | "purchases" | "cpa" | "trialCr" | "paywallCr" | "visitors";
type StatusFilter = "all" | "active" | "inactive";

/** Статусы «не крутится» (UNKNOWN сюда не входит: по таким кампаниям нет данных дашборда) */
const INACTIVE_STATUSES = new Set<string>(["INACTIVE", "PAUSED", "ARCHIVED"]);

export function CampaignTable({ rows, linkQuery }: { rows: CampaignEvaluation[]; linkQuery?: string }) {
  const campaignHref = (id: string) => `/campaigns/${encodeURIComponent(id)}${linkQuery ? `?${linkQuery}` : ""}`;
  const [q, setQ] = useState("");
  const [buyer, setBuyer] = useState<string>("all");
  const [verdict, setVerdict] = useState<Verdict | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "score", dir: "desc" });

  const buyers = useMemo(() => [...new Set(rows.map((r) => r.ad.buyer ?? "—"))].sort(), [rows]);

  const filtered = useMemo(() => {
    const val = (r: CampaignEvaluation, k: SortKey): number => {
      switch (k) {
        case "score":
          return r.score.grade === "N/A" ? -1 : r.score.score;
        case "spend":
          return r.ad.spend;
        case "purchases":
          return r.ad.purchases;
        case "cpa":
          return r.ad.cpa ?? Number.POSITIVE_INFINITY;
        case "trialCr":
          return r.funnel.trialCr ?? -1;
        case "paywallCr":
          return r.funnel.paywallCr ?? -1;
        case "visitors":
          return r.funnel.visitors;
      }
    };
    return rows
      .filter((r) => (q ? `${r.ad.campaignName} ${r.ad.campaignId} ${r.ad.buyer ?? ""} ${r.product ?? ""}`.toLowerCase().includes(q.toLowerCase()) : true))
      .filter((r) => (buyer === "all" ? true : (r.ad.buyer ?? "—") === buyer))
      .filter((r) => (verdict === "all" ? true : r.score.verdict === verdict))
      .filter((r) => (status === "all" ? true : status === "active" ? r.ad.status === "ACTIVE" : INACTIVE_STATUSES.has(r.ad.status)))
      .sort((a, b) => {
        const d = val(a, sort.key) - val(b, sort.key);
        return sort.dir === "asc" ? d : -d;
      });
  }, [rows, q, buyer, verdict, status, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={clsx("cursor-pointer select-none hover:text-ink", className)} onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.score.verdict] = (c[r.score.verdict] ?? 0) + 1;
    return c;
  }, [rows]);

  // Активность выводится по открутке: ACTIVE = есть показы или расход за последний день с данными дашборда
  const activity = useMemo(() => {
    const active = rows.filter((r) => r.ad.status === "ACTIVE");
    const inactive = rows.filter((r) => INACTIVE_STATUSES.has(r.ad.status));
    const asOf = active.map((r) => r.ad.lastActiveDate ?? "").sort().at(-1) || null;
    return { active: active.length, inactive: inactive.length, asOf };
  }, [rows]);
  const statusHint = activity.asOf
    ? `Активные — есть показы или расход за ${fmtDate(activity.asOf)}, последний день с данными дашборда. Своего статуса кампании API не отдаёт.`
    : "Активность определяется по открутке за последний день с данными дашборда";

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="flex items-center gap-1 rounded-full bg-subtle p-1">
          {(["all", "SCALE", "KEEP", "OPTIMIZE", "PAUSE", "NO_DATA"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVerdict(v)}
              className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", verdict === v ? "bg-ink text-white" : "text-muted hover:text-ink")}
            >
              {v === "all" ? "Все" : VERDICT_META[v].label}
              <span className="ml-1 opacity-60">{v === "all" ? rows.length : counts[v] ?? 0}</span>
            </button>
          ))}
        </div>
        <select className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)}>
          <option value="all">Все баеры</option>
          {buyers.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-full bg-subtle p-1" title={statusHint}>
          {(
            [
              ["all", "Все статусы", rows.length],
              ["active", "Активные", activity.active],
              ["inactive", "Неактивные", activity.inactive],
            ] as const
          ).map(([v, label, n]) => (
            <button key={v} onClick={() => setStatus(v)} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", status === v ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {label}
              <span className="ml-1 opacity-60">{n}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder="Поиск по названию / id" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <Th k="score">Скор</Th>
              <th>Кампания</th>
              <th>Вердикт</th>
              <Th k="spend" className="text-right">
                Расход
              </Th>
              <Th k="visitors" className="text-right">
                Визиты
              </Th>
              <Th k="purchases" className="text-right">
                Триалы
              </Th>
              <Th k="cpa" className="text-right">
                CPA
              </Th>
              <Th k="trialCr" className="text-right">
                CR в триал
              </Th>
              <Th k="paywallCr" className="text-right">
                CR пэйвола
              </Th>
              <th>Главная проблема</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const worst = r.score.criteria.filter((c) => c.status === "bad").sort((a, b) => b.maxPoints - a.maxPoints)[0];
              return (
                <tr key={r.ad.campaignId}>
                  <td>
                    <ScoreBadge score={r.score.score} grade={r.score.grade} size="sm" />
                  </td>
                  <td className="max-w-[320px]">
                    <Link href={campaignHref(r.ad.campaignId)} className="block truncate font-semibold hover:underline">
                      {r.ad.campaignName}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      <span className={clsx("h-1.5 w-1.5 rounded-full", r.ad.status === "ACTIVE" ? "bg-success" : "bg-line")} title={fmtStatus(r.ad)} />
                      <span className={clsx("font-semibold", r.product ? "text-ink" : "text-muted")}>{r.product ? PRODUCT_LABEL[r.product] : "?"}</span> · {r.ad.buyer ?? "—"} · {r.ad.geo ?? "—"} ·{" "}
                      {r.ad.campaignId}
                    </div>
                  </td>
                  <td>
                    <VerdictPill verdict={r.score.verdict} />
                  </td>
                  <td className="text-right tabular-nums">{fmtMoney(r.ad.spend)}</td>
                  <td className="text-right tabular-nums">{fmtNum(r.funnel.visitors)}</td>
                  <td className="text-right tabular-nums">{fmtNum(r.ad.purchases)}</td>
                  <td className="text-right tabular-nums">{fmtMoney(r.ad.cpa, 2)}</td>
                  <td className="text-right tabular-nums">{fmtPct(r.funnel.trialCr, 2)}</td>
                  <td className="text-right tabular-nums">{fmtPct(r.funnel.paywallCr)}</td>
                  <td className="max-w-[220px] truncate text-xs text-muted">{worst ? `${worst.label}: ${worst.note.split(" — ")[0]}` : r.score.verdict === "NO_DATA" ? "нет данных воронки" : "—"}</td>
                  <td>
                    <Link href={campaignHref(r.ad.campaignId)} className="text-muted hover:text-ink">
                      <ChevronRight size={16} />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-sm text-muted">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
