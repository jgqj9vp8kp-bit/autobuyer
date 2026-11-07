"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, ImageOff, Search } from "lucide-react";
import { FunnelBars } from "@/components/FunnelBars";
import { ScoreBadge, VerdictPill } from "@/components/ui";
import type { CreativeEvaluation } from "@/lib/creatives";
import { fmtDate, fmtMoney, fmtNum, fmtPct } from "@/lib/format";
import { PRODUCT_LABEL } from "@/lib/products";
import { trialsNote } from "@/lib/trials";
import type { Verdict } from "@/lib/types";
import { VERDICT_META } from "@/lib/verdict";

type SortKey = "score" | "spend" | "visitors" | "purchases" | "cpa" | "ctr" | "trialCr" | "paywallCr";
type Sort = { key: SortKey; dir: "asc" | "desc" };

export const TYPE_LABEL: Record<string, string> = { IMAGE: "Картинка", VIDEO: "Видео" };

const valueOf = (r: CreativeEvaluation, k: SortKey): number => {
  switch (k) {
    case "score":
      return r.score.grade === "N/A" ? -1 : r.score.score;
    case "spend":
      return r.ad.spend;
    case "visitors":
      return r.funnel.visitors;
    case "purchases":
      return r.ad.purchases;
    case "cpa":
      return r.ad.cpa ?? Number.POSITIVE_INFINITY;
    case "ctr":
      return r.ad.ctr;
    case "trialCr":
      return r.funnel.trialCr ?? -1;
    case "paywallCr":
      return r.funnel.paywallCr ?? -1;
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

/** Ссылки на картинки временные (CDN Meta): если устарела, показываем заглушку. */
export function CreativePreview({ src, alt, className, contain = false }: { src: string | null; alt: string; className: string; contain?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={clsx("flex items-center justify-center rounded-lg bg-subtle text-muted", className)}>
        <ImageOff size={16} />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={clsx("rounded-lg bg-subtle", contain ? "object-contain" : "object-cover", className)} />;
}

export function CreativeDetails({ r, linkQuery, showCampaigns = true }: { r: CreativeEvaluation; linkQuery: string; showCampaigns?: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,300px)]">
      <div className="min-w-0 space-y-2">
        <CreativePreview src={r.imageUrl ?? r.thumbnailUrl} alt={r.name} className="h-56 w-full" contain />
        <div className="text-xs leading-relaxed text-muted">
          {r.type ? (TYPE_LABEL[r.type] ?? r.type) : "Формат неизвестен"}
          {r.createdDate ? ` · создан ${fmtDate(r.createdDate)}` : ""}
          {r.creativeIds.length > 1 ? ` · ${r.creativeIds.length} копий` : ""} · объявлений {r.adCount}
        </div>
        {r.destinationUrl && (
          <a href={r.destinationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:underline">
            <ExternalLink size={12} /> {r.destinationHost}
          </a>
        )}
      </div>
      <div className="min-w-0">
        <div className="kicker mb-2">Воронка креатива · PostHog</div>
        {r.funnel.visitors > 0 ? (
          <div className="scrollbar-thin overflow-x-auto">
            <div className="min-w-[440px]">
              <FunnelBars funnel={r.funnel} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted">Трафика этого креатива нет в воронке PostHog.</div>
        )}
      </div>
      <div className="min-w-0 space-y-4">
        {showCampaigns && (
          <div>
            <div className="kicker mb-2">Кампании</div>
            <ul className="space-y-1 text-xs">
              {r.campaigns.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-baseline justify-between gap-3">
                  <Link href={`/campaigns/${encodeURIComponent(c.id)}?${linkQuery}`} className="truncate font-medium hover:underline" title={c.name}>
                    {c.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">{fmtMoney(c.spend)}</span>
                </li>
              ))}
              {r.campaigns.length > 8 && <li className="text-muted">и ещё {r.campaigns.length - 8}</li>}
            </ul>
          </div>
        )}
        {r.score.recommendations.length > 0 && (
          <div>
            <div className="kicker mb-2">Что делать</div>
            <ul className="space-y-1.5 text-xs leading-relaxed">
              {r.score.recommendations.slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreativeTable({ rows, linkQuery }: { rows: CreativeEvaluation[]; linkQuery: string }) {
  const [q, setQ] = useState("");
  const [buyer, setBuyer] = useState("all");
  const [geo, setGeo] = useState("all");
  const [type, setType] = useState("all");
  const [verdict, setVerdict] = useState<Verdict | "all">("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "spend", dir: "desc" });
  const [open, setOpen] = useState<string | null>(null);

  const buyers = useMemo(() => [...new Set(rows.flatMap((r) => r.buyers))].sort(), [rows]);
  const geos = useMemo(() => [...new Set(rows.flatMap((r) => r.geos))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map((r) => r.type).filter((t): t is string => Boolean(t)))].sort(), [rows]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.score.verdict] = (c[r.score.verdict] ?? 0) + 1;
    return c;
  }, [rows]);
  const activeCount = useMemo(() => rows.filter((r) => r.ad.status === "ACTIVE").length, [rows]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return rows
      .filter((r) => (needle ? `${r.name} ${r.creativeIds.join(" ")} ${r.buyers.join(" ")} ${r.campaigns.map((c) => c.name).join(" ")} ${r.funnelAlias ?? ""}`.toLowerCase().includes(needle) : true))
      .filter((r) => buyer === "all" || r.buyers.includes(buyer))
      .filter((r) => geo === "all" || r.geos.includes(geo))
      .filter((r) => type === "all" || r.type === type)
      .filter((r) => verdict === "all" || r.score.verdict === verdict)
      .filter((r) => !activeOnly || r.ad.status === "ACTIVE")
      .sort((a, b) => {
        const d = valueOf(a, sort.key) - valueOf(b, sort.key);
        return sort.dir === "asc" ? d : -d;
      });
  }, [rows, q, buyer, geo, type, verdict, activeOnly, sort]);

  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "cpa" ? "asc" : "desc" }));
  const th = { sort, onSort };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-1 rounded-full bg-subtle p-1">
          {(["all", "SCALE", "KEEP", "OPTIMIZE", "PAUSE", "NO_DATA"] as const).map((v) => (
            <button key={v} onClick={() => setVerdict(v)} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", verdict === v ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {v === "all" ? "Все" : VERDICT_META[v].label}
              <span className="ml-1 opacity-60">{v === "all" ? rows.length : (counts[v] ?? 0)}</span>
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
        <select className="input" value={geo} onChange={(e) => setGeo(e.target.value)}>
          <option value="all">Все гео</option>
          {geos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">Все форматы</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted" title="Есть показы или расход за последний день с данными">
          <input type="checkbox" className="accent-ink" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          Только активные <span className="opacity-60">{activeCount}</span>
        </label>
        <div className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder="Поиск по тексту, кампании, id" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <Th k="score" {...th}>
                Скор
              </Th>
              <th>Креатив</th>
              <th>Вердикт</th>
              <Th k="spend" className="text-right" {...th}>
                Расход
              </Th>
              <Th k="visitors" className="text-right" {...th}>
                Визиты
              </Th>
              <Th k="purchases" className="text-right" {...th}>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isOpen = open === r.key;
              return (
                <Fragment key={r.key}>
                  <tr className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.key)}>
                    <td>
                      <ScoreBadge score={r.score.score} grade={r.score.grade} size="sm" />
                    </td>
                    <td className="max-w-[360px]">
                      <div className="flex items-center gap-3">
                        <CreativePreview src={r.thumbnailUrl} alt={r.name} className="h-11 w-11 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-semibold" title={r.name}>
                            {r.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
                            <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", r.ad.status === "ACTIVE" ? "bg-success" : "bg-line")} title={r.ad.status === "ACTIVE" ? "крутится" : "не крутится"} />
                            <span className="truncate">
                              <span className="font-semibold text-ink">{r.product ? PRODUCT_LABEL[r.product] : (r.destinationHost ?? "?")}</span> · {r.type ? (TYPE_LABEL[r.type] ?? r.type) : "формат ?"} · {r.buyers.join(", ") || "—"} · {r.geos.join(", ") || "—"} ·{" "}
                              <span className="font-mono">{r.funnelAlias ?? "воронка ?"}</span>
                              {r.campaigns.length > 1 ? ` · ${r.campaigns.length} кампаний` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <VerdictPill verdict={r.score.verdict} />
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(r.ad.spend)}</td>
                    <td className="text-right tabular-nums">{fmtNum(r.funnel.visitors)}</td>
                    <td className="text-right tabular-nums" title={trialsNote(r.ad) ?? undefined}>
                      {fmtNum(r.ad.purchases)}
                      {r.ad.trialsSource === "posthog" && r.ad.fbPurchases !== undefined && r.ad.fbPurchases !== r.ad.purchases && <span className="ml-1 text-[10px] text-muted">FB {r.ad.fbPurchases}</span>}
                    </td>
                    <td className="text-right tabular-nums">{fmtMoney(r.ad.cpa, 2)}</td>
                    <td className="text-right tabular-nums">{r.ad.impressions > 0 ? `${r.ad.ctr.toFixed(2)}%` : "—"}</td>
                    <td className="text-right tabular-nums">{fmtPct(r.funnel.trialCr, 2)}</td>
                    <td className="text-right tabular-nums">{fmtPct(r.funnel.paywallCr)}</td>
                    <td className="text-muted">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={11} className="bg-subtle/40">
                        <CreativeDetails r={r} linkQuery={linkQuery} />
                      </td>
                    </tr>
                  )}
                </Fragment>
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
