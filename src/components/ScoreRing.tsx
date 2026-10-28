export function ScoreRing({ score, grade, size = 120 }: { score: number; grade: string; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = grade === "N/A" ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color = grade === "N/A" ? "#d0cdd7" : score >= 75 ? "#1f9d5a" : score >= 55 ? "#ffc743" : score >= 35 ? "#d98a00" : "#d93a3a";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f2eff3" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-3xl font-bold leading-none">{grade === "N/A" ? "—" : score}</div>
        <div className="mt-1 text-[11px] font-semibold text-muted">GRADE {grade}</div>
      </div>
    </div>
  );
}
