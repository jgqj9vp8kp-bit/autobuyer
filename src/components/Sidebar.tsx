"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Layers, SlidersHorizontal, Plug, Sparkles, BookOpen } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Кампании", icon: LayoutDashboard },
  { href: "/benchmarks", label: "Сегменты", icon: Layers },
  { href: "/rules", label: "Правила", icon: SlidersHorizontal },
  { href: "/settings", label: "Источники", icon: Plug },
  { href: "/docs", label: "Как считаем", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-[72px] shrink-0 flex-col items-center bg-rail py-4 text-white">
      <Link href="/" className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-ink" title="Autobuyer">
        <Sparkles size={18} />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" || pathname.startsWith("/campaigns") : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "group flex w-16 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium tracking-wide transition",
                active ? "bg-white/10 text-accent" : "text-white/55 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon size={18} />
              <span className="text-center leading-tight">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">AB</div>
    </aside>
  );
}
