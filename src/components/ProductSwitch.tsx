"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { PRODUCTS } from "@/lib/products";
import type { ProductKey } from "@/lib/types";

/** Переключатель продукта на дашборде: пишет ?product=… в URL, остальные параметры сохраняет. */
export function ProductSwitch({ value, counts }: { value: ProductKey | null; counts: Partial<Record<ProductKey | "all", number>> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const select = (p: ProductKey | null) => {
    const q = new URLSearchParams(sp.toString());
    if (p) q.set("product", p);
    else q.delete("product");
    q.delete("r");
    start(() => router.push(`${pathname}?${q.toString()}`));
  };

  const items: Array<{ key: ProductKey | null; label: string }> = [{ key: null, label: "Все продукты" }, ...PRODUCTS.map((p) => ({ key: p.key, label: p.label }))];

  return (
    <div className={clsx("flex items-center gap-1 rounded-full border border-line bg-white p-1", pending && "opacity-60")}>
      {items.map((it) => {
        const n = counts[it.key ?? "all"];
        return (
          <button
            key={it.key ?? "all"}
            onClick={() => select(it.key)}
            className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", value === it.key ? "bg-ink text-white" : "text-muted hover:bg-subtle hover:text-ink")}
          >
            {it.label}
            {n !== undefined && <span className="ml-1 opacity-60">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
