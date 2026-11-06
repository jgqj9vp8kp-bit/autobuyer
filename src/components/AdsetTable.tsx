"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { CreativeDetails, CreativePreview, TYPE_LABEL } from "@/components/CreativeTable";
import { ScoreBadge, VerdictPill } from "@/components/ui";
import type { AdsetRowView } from "@/lib/adsets";
import type { CreativeEvaluation, CreativeReport } from "@/lib/creatives";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { trialsNote } from "@/lib/trials";

type SortKey = "score" | "spend" | "visitors" | "trials" | "cpa" | "ctr" | "trialCr" | "paywallCr";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type CreativesState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: CreativeEvaluation[] };

const COLUMNS = 10;

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

const Message = ({ children }: { children: ReactNode }) => (
  <tr className="bg-subtle/40">
    <td colSpan={COLUMNS} className="py-4 pl-10 text-sm text-muted">
      {children}
    </td>
  </tr>
);

/** Строки креативов адсета: те же колонки, что у адсета, клик открывает большой креатив и его воронку. */
function CreativeRows({ rows, adset, linkQuery }: { rows: CreativeEvaluation[]; adset: AdsetRowView; linkQuery: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (rows.length === 0) return <Message>За этот период нет данных о креативах адсета: полные данные дашборд отдаёт только за последние недели.</Message>;
  const covered = rows.reduce((s, c) => s + c.ad.spend, 0);
  return (
    <>
      {rows.map((c) => {
        const isOpen = open === c.key;
        return (
          <Fragment key={c.key}>
            <tr className="cursor-pointer bg-subtle/40" onClick={() => setOpen(isOpen ? null : c.key)} title={isOpen ? "Свернуть креатив" : "Показать креатив и его воронку"}>
              <td>
                <ScoreBadge score={c.score.score} grade={c.score.grade} size="sm" />
              </td>
              <td className="max-w-[340px]">
                <div className="flex items-center gap-2.5 pl-5">
                  {isOpen ? <ChevronDown size={14} className="shrink-0 text-muted" /> : <ChevronRight size={14} className="shrink-0 text-muted" />}
                  <CreativePreview src={c.thumbnailUrl} alt={c.name} className="h-10 w-10 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold" title={c.name}>
                      {c.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
                      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", c.ad.status === "ACTIVE" ? "bg-success" : "bg-line")} title={c.ad.status === "ACTIVE" ? "крутится" : "не крутится"} />
                      {c.type ? (TYPE_LABEL[c.type] ?? c.type) : "формат ?"}
                      {c.createdDate ? ` · создан ${fmtDate(c.createdDate)}` : ""}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <VerdictPill verdict={c.score.verdict} />
              </td>
              <td className="text-right tabular-nums">{fmtMoney(c.ad.spend)}</td>
              <td className="text-right tabular-nums">{fmtNum(c.funnel.visitors)}</td>
              <td className="text-right tabular-nums" title={trialsNote(c.ad) ?? undefined}>
                {fmtNum(c.ad.purchases)}
                {c.ad.trialsSource === "posthog" && c.ad.fbPurchases !== undefined && c.ad.fbPurchases !== c.ad.purchases && <span className="ml-1 text-[10px] text-muted">FB {c.ad.fbPurchases}</span>}
              </td>
              <td className="text-right tabular-nums">{fmtMoney(c.ad.cpa, 2)}</td>
              <td className="text-right tabular-nums">{c.ad.impressions > 0 ? `${c.ad.ctr.toFixed(2)}%` : "—"}</td>
              <td className="text-right tabular-nums">{fmtPct(c.funnel.trialCr, 2)}</td>
              <td className="text-right tabular-nums">{fmtPct(c.funnel.paywallCr)}</td>
            </tr>
            {isOpen && (
              <tr className="bg-subtle/40">
                <td colSpan={COLUMNS}>
                  <CreativeDetails r={c} linkQuery={linkQuery} showCampaigns={false} />
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
      {adset.spend - covered > 1 && <Message>Креативами покрыто {fmtMoney(covered)} из {fmtMoney(adset.spend)} расхода адсета: за старые дни дашборд не знает креативы части объявлений.</Message>}
    </>
  );
}

/** Таблица адсетов кампании: сортировка по любой колонке, клик раскрывает креативы адсета и показывает его в блоках ниже. */
export function AdsetTable({ adsets, value, campaignId, from, to }: { adsets: AdsetRowView[]; value: string | null; campaignId: string; from: string; to: string }) {
  const { select, pending } = useAdsetNav();
  const [sort, setSort] = useState<Sort>({ key: "spend", dir: "desc" });
  const [open, setOpen] = useState<string | null>(value);
  const [creatives, setCreatives] = useState<Record<string, CreativesState>>({});
  const keyOf = useCallback((id: string) => `${from}:${to}:${id}`, [from, to]);

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

  const load = useCallback(
    async (id: string) => {
      const key = keyOf(id);
      setCreatives((m) => ({ ...m, [key]: { status: "loading" } }));
      try {
        const q = new URLSearchParams({ from, to, campaign: campaignId, adset: id });
        const res = await fetch(`/api/creatives?${q.toString()}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as CreativeReport;
        setCreatives((m) => ({ ...m, [key]: { status: "ready", rows: body.creatives } }));
      } catch {
        setCreatives((m) => ({ ...m, [key]: { status: "error" } }));
      }
    },
    [from, to, campaignId, keyOf],
  );

  // Адсет могли выбрать селектором в шапке воронки или открыть по ссылке
  useEffect(() => setOpen(value), [value]);

  const openState = open ? creatives[keyOf(open)] : undefined;
  useEffect(() => {
    if (open && !openState) void load(open);
  }, [open, openState, load]);

  const toggle = (id: string) => {
    const next = open === id ? null : id;
    setOpen(next);
    select(next);
  };

  return (
    <div className={clsx("scrollbar-thin overflow-x-auto", pending && "opacity-80")}>
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
          {rows.map((a) => {
            const isOpen = open === a.id;
            const state = isOpen ? creatives[keyOf(a.id)] : undefined;
            return (
              <Fragment key={a.id}>
                <tr className={clsx("cursor-pointer", isOpen && "bg-accent-soft")} onClick={() => toggle(a.id)} title={isOpen ? "Свернуть и показать всю кампанию" : "Раскрыть креативы адсета"}>
                  <td>
                    <ScoreBadge score={a.score} grade={a.grade} size="sm" />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown size={14} className="shrink-0 text-muted" /> : <ChevronRight size={14} className="shrink-0 text-muted" />}
                      <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", a.active ? "bg-success" : "bg-line")} title={a.active ? "крутится" : "не крутится"} />
                      <span className="font-semibold">{a.label}</span>
                      {a.geo && <span className="text-xs text-muted">{a.geo}</span>}
                    </div>
                    <div className="mt-0.5 pl-[22px] font-mono text-[11px] text-muted">{a.id}</div>
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
                {isOpen && (!state || state.status === "loading") && <Message>Загружаю креативы…</Message>}
                {isOpen && state?.status === "error" && (
                  <Message>
                    Не удалось загрузить креативы.{" "}
                    <button className="font-semibold text-ink underline" onClick={() => void load(a.id)}>
                      Повторить
                    </button>
                  </Message>
                )}
                {isOpen && state?.status === "ready" && <CreativeRows rows={state.rows} adset={a} linkQuery={`from=${from}&to=${to}`} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
