import { cn, formatNumber } from "../lib/utils";

export function MetricCard({
  label,
  value,
  unit,
  accent = "cyan",
}: {
  label: string;
  value?: number | string | null;
  unit?: string;
  accent?: "cyan" | "copper" | "ember";
}) {
  const tone =
    accent === "copper"
      ? "from-signal-copper/20 text-signal-copper"
      : accent === "ember"
        ? "from-signal-ember/20 text-signal-ember"
        : "from-signal-cyan/20 text-signal-cyan";

  const display = typeof value === "number" ? formatNumber(value) : value ?? "--";

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-graphite-900/80 p-4">
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", tone)} />
      <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-signal-fog/55">{label}</div>
      <div className="mt-3 flex items-end gap-2">
        <div className="font-display text-4xl tracking-[0.08em] text-white">{display}</div>
        {unit ? <div className="pb-1 font-mono text-xs uppercase tracking-[0.22em] text-signal-fog/55">{unit}</div> : null}
      </div>
    </div>
  );
}

