"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ScoreBadge, VerdictPill } from "@/components/ui";
import type { AdsetRowView } from "@/lib/adsets";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/format";

type SortKey = "score" | "spend" | "visitors" | "trials" | "cpa" | "ctr" | "trialCr" | "paywallCr";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Выбор адсета живёт в адресе (?adset=…): страницу можно обновить и отправить ссылкой. */
function useAdsetNav() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const select = (id: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (id) q.set("adset", id);
    else q.delete("adset");
    q.delete("r");
    start(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }));
  };
  return { select, pending };
}

const optionLabel = (a: AdsetRowView) => `${a.label}${a.geo ? ` · ${a.geo}` : ""} · ${fmtMoney(a.spend)} · триалов ${fmtNum(a.trials)}`;

/** Селектор в шапке воронки */
export function AdsetSelect({ adsets, value }: { adsets: AdsetRowView[]; value: string | null }) {
  const { select, pending } = useAdsetNav();
  if (adsets.length === 0) return null;
  const single = adsets.length === 1;
  return (
    <select
      className={clsx("input min-w-0 max-w-full flex-1 sm:max-w-[340px]", pending && "opacity-60")}
      value={single ? adsets[0].id : (value ?? "")}
      disabled={single}
      onChange={(e) => select(e.target.value || null)}
      title={single ? "В кампании один адсет" : "Показать воронку, скор и динамику одного адсета"}
      aria-label="Адсет"
    >
      {single ? (
        <option value={adsets[0].id}>Один адсет: {optionLabel(adsets[0])}</option>
      ) : (
        <>
          <option value="">Все адсеты ({adsets.length})</option>
          {adsets.map((a) => (
            <option key={a.id} value={a.id}>
              {optionLabel(a)}
            </option>
          ))}
        </>
      )}
    </select>
  );
}

const valueOf = (r: AdsetRowView, k: SortKey): number => {
  switch (k) {
    case "score":
      return r.grade === "N/A" ? -1 : r.score;
    case "spend":
      return r.spend;
    case "visitors":
      return r.visitors;
    case "trials":
      return r.trials;
    case "cpa":
      return r.cpa ?? Number.POSITIVE_INFINITY;
    case "ctr":
      return r.ctr;
    case "trialCr":
      return r.trialCr ?? -1;
    case "paywallCr":
      return r.paywallCr ?? -1;
  }
};

function Th({ k, sort, onSort, children, className }: { k: SortKey; sort: Sort; onSort: (k: SortKey) => void; children: ReactNode; className?: string }) {
  return (
    <th className={clsx("cursor-pointer select-none hover:text-ink", className)} onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}

/** Таблица адсетов кампании: сортировка по любой колонке, клик по строке выбирает адсет ниже на странице. */
export function AdsetTable({ adsets, value }: { adsets: AdsetRowView[]; value: string | null }) {
  const { select, pending } = useAdsetNav();
  const [sort, setSort] = useState<Sort>({ key: "spend", dir: "desc" });
  const rows = useMemo(
    () =>
      [...adsets].sort((a, b) => {
        const d = valueOf(a, sort.key) - valueOf(b, sort.key);
        return sort.dir === "asc" ? d : -d;
      }),
    [adsets, sort],
  );
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "cpa" ? "asc" : "desc" }));
  const th = { sort, onSort };

  return (
    <div className={clsx("scrollbar-thin overflow-x-auto", pending && "opacity-60")}>
      <table className="table w-full">
        <thead>
          <tr>
            <Th k="score" {...th}>
              Скор
            </Th>
            <th>Адсет</th>
            <th>Вердикт</th>
            <Th k="spend" className="text-right" {...th}>
              Расход
            </Th>
            <Th k="visitors" className="text-right" {...th}>
              Визиты
            </Th>
            <Th k="trials" className="text-right" {...th}>
              Триалы
            </Th>
            <Th k="cpa" className="text-right" {...th}>
              CPA
            </Th>
            <Th k="ctr" className="text-right" {...th}>
              CTR
            </Th>
            <Th k="trialCr" className="text-right" {...th}>
              CR в триал
            </Th>
            <Th k="paywallCr" className="text-right" {...th}>
              CR пэйвола
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={clsx("cursor-pointer", value === a.id && "bg-accent-soft")} onClick={() => select(value === a.id ? null : a.id)} title={value === a.id ? "Показать всю кампанию" : "Показать этот адсет ниже"}>
              <td>
                <ScoreBadge score={a.score} grade={a.grade} size="sm" />
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", a.active ? "bg-success" : "bg-line")} title={a.active ? "крутится" : "не крутится"} />
                  <span className="font-semibold">{a.label}</span>
                  {a.geo && <span className="text-xs text-muted">{a.geo}</span>}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">{a.id}</div>
              </td>
              <td>
                <VerdictPill verdict={a.verdict} />
              </td>
              <td className="text-right tabular-nums">{fmtMoney(a.spend)}</td>
              <td className="text-right tabular-nums">{fmtNum(a.visitors)}</td>
              <td className="text-right tabular-nums">
                {fmtNum(a.trials)}
                {a.fbPurchases !== undefined && a.fbPurchases !== a.trials && <span className="ml-1 text-[10px] text-muted">FB {a.fbPurchases}</span>}
              </td>
              <td className="text-right tabular-nums">{fmtMoney(a.cpa, 2)}</td>
              <td className="text-right tabular-nums">{a.impressions > 0 ? `${a.ctr.toFixed(2)}%` : "—"}</td>
              <td className="text-right tabular-nums">{fmtPct(a.trialCr, 2)}</td>
              <td className="text-right tabular-nums">{fmtPct(a.paywallCr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
