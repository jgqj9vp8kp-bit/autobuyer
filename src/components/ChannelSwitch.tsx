"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import { CHANNELS } from "@/lib/channels";
import type { Channel } from "@/lib/types";

/** Переключатель канала трафика: ?channel=facebook|google|tiktok|other. Каналы без кампаний скрыты. */
export function ChannelSwitch({ value, counts }: { value: Channel; counts: Partial<Record<Channel, number>> }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const select = (c: Channel) => {
    const q = new URLSearchParams(sp.toString());
    q.set("channel", c);
    q.delete("r");
    start(() => router.push(`${pathname}?${q.toString()}`));
  };

  const items = CHANNELS.filter((c) => c.key === value || (counts[c.key] ?? 0) > 0);

  return (
    <div className={clsx("flex items-center gap-1 rounded-full bg-ink p-1 text-white", pending && "opacity-60")}>
      {items.map((c) => (
        <button
          key={c.key}
          onClick={() => select(c.key)}
          title={c.hint}
          className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition", value === c.key ? "bg-accent text-ink" : "text-white/70 hover:bg-white/10 hover:text-white")}
        >
          {c.label}
          <span className="ml-1 opacity-60">{counts[c.key] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
