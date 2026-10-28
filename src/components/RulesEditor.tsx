"use client";

import { useState } from "react";
import clsx from "clsx";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { FunnelStepDef, ScoringConfig, ScoringCriterion } from "@/lib/types";
import { GROUP_LABEL } from "@/lib/verdict";

export function RulesEditor({ initial }: { initial: ScoringConfig }) {
  const [cfg, setCfg] = useState<ScoringConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const total = cfg.criteria.filter((c) => c.enabled).reduce((s, c) => s + c.maxPoints, 0);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Ошибка сохранения");
      setCfg(body);
      setMsg("Сохранено. Скор пересчитается при следующем обновлении дашборда.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirm("Сбросить правила к значениям по умолчанию?")) return;
    const res = await fetch("/api/config", { method: "DELETE" });
    setCfg(await res.json());
    setMsg("Сброшено к значениям по умолчанию.");
  };

  const updCriterion = (i: number, patch: Partial<ScoringCriterion>) =>
    setCfg((c) => ({ ...c, criteria: c.criteria.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const updBand = (i: number, b: number, patch: Partial<{ value: number; points: number }>) =>
    setCfg((c) => ({ ...c, criteria: c.criteria.map((x, j) => (j === i ? { ...x, bands: x.bands.map((y, k) => (k === b ? { ...y, ...patch } : y)) } : x)) }));
  const addBand = (i: number) => setCfg((c) => ({ ...c, criteria: c.criteria.map((x, j) => (j === i ? { ...x, bands: [...x.bands, { value: 0, points: 0 }] } : x)) }));
  const delBand = (i: number, b: number) => setCfg((c) => ({ ...c, criteria: c.criteria.map((x, j) => (j === i ? { ...x, bands: x.bands.filter((_, k) => k !== b) } : x)) }));
  const updStep = (i: number, patch: Partial<FunnelStepDef>) => setCfg((c) => ({ ...c, funnel: c.funnel.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-4 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <label className="text-xs">
            <div className="kicker mb-1">Целевой CPA, $</div>
            <input className="input w-full" type="number" step="0.5" value={cfg.targetCpa} onChange={(e) => setCfg({ ...cfg, targetCpa: num(e.target.value) })} />
          </label>
          <label className="text-xs">
            <div className="kicker mb-1">Мин. визитов</div>
            <input className="input w-full" type="number" value={cfg.minVisitors} onChange={(e) => setCfg({ ...cfg, minVisitors: num(e.target.value) })} />
          </label>
          {(["scale", "keep", "optimize"] as const).map((k) => (
            <label key={k} className="text-xs">
              <div className="kicker mb-1">{k === "scale" ? "Масштабировать ≥" : k === "keep" ? "Держать ≥" : "Оптимизировать ≥"}</div>
              <input className="input w-full" type="number" value={cfg.verdicts[k]} onChange={(e) => setCfg({ ...cfg, verdicts: { ...cfg.verdicts, [k]: num(e.target.value) } })} />
            </label>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="mr-2 text-xs text-muted">
            Всего баллов: <span className="font-semibold text-ink">{total}</span>
          </div>
          <button className="btn btn-ghost" onClick={reset}>
            <RotateCcw size={14} /> Сбросить
          </button>
          <button className="btn btn-dark" onClick={save} disabled={saving}>
            <Save size={14} /> {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
        {msg && <div className="w-full text-xs text-muted">{msg}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {cfg.criteria.map((c, i) => (
            <div key={c.key} className={clsx("card p-4 transition", !c.enabled && "opacity-50")}>
              <div className="flex flex-wrap items-start gap-3">
                <label className="mt-1 flex items-center">
                  <input type="checkbox" className="accent-ink" checked={c.enabled} onChange={(e) => updCriterion(i, { enabled: e.target.checked })} />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="input min-w-[220px] flex-1 font-semibold" value={c.label} onChange={(e) => updCriterion(i, { label: e.target.value })} />
                    <span className="rounded-md bg-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{GROUP_LABEL[c.group]}</span>
                    <span className="rounded-md bg-subtle px-2 py-1 font-mono text-[10px] text-muted">{c.metric}</span>
                  </div>
                  <input className="input mt-2 w-full text-xs" value={c.description ?? ""} placeholder="Описание" onChange={(e) => updCriterion(i, { description: e.target.value })} />
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-xs">
                      <div className="kicker mb-1">Макс. баллов</div>
                      <input className="input w-24" type="number" value={c.maxPoints} onChange={(e) => updCriterion(i, { maxPoints: num(e.target.value) })} />
                    </label>
                    <label className="text-xs">
                      <div className="kicker mb-1">Мин. визитов</div>
                      <input className="input w-24" type="number" value={c.minSample ?? 0} onChange={(e) => updCriterion(i, { minSample: num(e.target.value) || undefined })} />
                    </label>
                    <label className="text-xs">
                      <div className="kicker mb-1">{c.lowerIsBetter ? "Проблема, если >" : "Проблема, если <"}</div>
                      <input
                        className="input w-28"
                        type="number"
                        step="0.01"
                        value={c.lowerIsBetter ? (c.warnAbove ?? "") : (c.warnBelow ?? "")}
                        onChange={(e) => updCriterion(i, c.lowerIsBetter ? { warnAbove: e.target.value === "" ? undefined : Number(e.target.value) } : { warnBelow: e.target.value === "" ? undefined : Number(e.target.value) })}
                      />
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-xs text-muted">
                      <input type="checkbox" className="accent-ink" checked={Boolean(c.lowerIsBetter)} onChange={(e) => updCriterion(i, { lowerIsBetter: e.target.checked })} />
                      меньше = лучше
                    </label>
                  </div>
                  <div className="mt-3">
                    <div className="kicker mb-1">Пороги (значение → баллы, между точками — линейно)</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.bands.map((b, k) => (
                        <div key={k} className="flex items-center gap-1 rounded-xl border border-line bg-white p-1">
                          <input className="w-20 rounded-lg px-2 py-1 text-xs outline-none" type="number" step="0.001" value={b.value} onChange={(e) => updBand(i, k, { value: Number(e.target.value) })} />
                          <span className="text-xs text-muted">→</span>
                          <input className="w-14 rounded-lg bg-accent-soft px-2 py-1 text-xs font-semibold outline-none" type="number" step="0.5" value={b.points} onChange={(e) => updBand(i, k, { points: Number(e.target.value) })} />
                          <button className="px-1 text-muted hover:text-danger" onClick={() => delBand(i, k)} title="Удалить порог">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-ghost !px-2 !py-1.5" onClick={() => addBand(i)}>
                        <Plus size={12} /> порог
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card h-fit p-4">
          <div className="kicker">Шаги воронки · PostHog</div>
          <h3 className="mb-3 text-base font-bold">Какие события считаем</h3>
          <div className="space-y-2">
            {cfg.funnel.map((s, i) => (
              <div key={i} className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <input className="input w-24 font-mono text-[11px]" value={s.key} onChange={(e) => updStep(i, { key: e.target.value })} title="ключ шага" />
                  <input className="input flex-1 text-xs" value={s.label} onChange={(e) => updStep(i, { label: e.target.value })} />
                  <button className="text-muted hover:text-danger" onClick={() => setCfg((c) => ({ ...c, funnel: c.funnel.filter((_, j) => j !== i) }))}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <input className="input flex-1 font-mono text-[11px]" value={s.event} placeholder="event" onChange={(e) => updStep(i, { event: e.target.value })} />
                  <input
                    className="input w-24 font-mono text-[11px]"
                    value={s.property?.name ?? ""}
                    placeholder="prop"
                    onChange={(e) => updStep(i, { property: e.target.value ? { name: e.target.value, value: s.property?.value ?? "" } : undefined })}
                  />
                  <input
                    className="input w-16 font-mono text-[11px]"
                    value={s.property?.value ?? ""}
                    placeholder="=val"
                    onChange={(e) => updStep(i, { property: s.property ? { ...s.property, value: e.target.value } : undefined })}
                  />
                </div>
                <div className="mt-1.5 flex gap-3 text-[11px] text-muted">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" className="accent-ink" checked={Boolean(s.milestone)} onChange={(e) => updStep(i, { milestone: e.target.checked })} /> ключевая точка
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" className="accent-ink" checked={Boolean(s.optional)} onChange={(e) => updStep(i, { optional: e.target.checked })} /> опциональный
                  </label>
                </div>
              </div>
            ))}
            <button className="btn btn-ghost w-full justify-center" onClick={() => setCfg((c) => ({ ...c, funnel: [...c.funnel, { key: `step_${c.funnel.length + 1}`, label: "Новый шаг", event: "" }] }))}>
              <Plus size={14} /> Добавить шаг
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Ключи <code>landing</code>, <code>paywall</code>, <code>trial</code>, <code>upsell1</code>, <code>upsell2</code> зарезервированы: по ним считаются CR пэйвола, триала и апсейлов. Метрика «checkpointReach:&lt;key&gt;» работает для любого шага с флагом «ключевая точка».
          </p>
        </div>
      </div>
    </div>
  );
}
