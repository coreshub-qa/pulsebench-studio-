export interface SelectCardOption<T extends string> {
  value: T;
  title: string;
  kicker?: string;
  description: string;
}

export function SelectCards<T extends string>({
  options,
  value,
  onChange,
  columns = "xl:grid-cols-5",
}: {
  options: SelectCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  columns?: string;
}) {
  return (
    <div className={`grid gap-3 md:grid-cols-2 ${columns}`}>
      {options.map((card) => {
        const active = value === card.value;
        return (
          <button
            key={card.value}
            type="button"
            onClick={() => onChange(card.value)}
            aria-pressed={active}
            className={`relative overflow-hidden rounded-[22px] border p-4 text-left transition ${
              active
                ? "border-signal-copper/55 bg-[linear-gradient(180deg,rgba(200,154,91,0.16),rgba(255,255,255,0.05))] shadow-[inset_0_1px_0_rgba(110,203,184,0.55),0_0_0_1px_rgba(200,154,91,0.18),0_22px_50px_rgba(0,0,0,0.22)]"
                : "border-white/8 bg-white/[0.018] hover:border-white/14 hover:bg-white/[0.03]"
            }`}
          >
            {active ? (
              <div className="mb-3 inline-flex items-center rounded-full border border-signal-copper/28 bg-signal-copper/12 px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] text-signal-copper">
                当前选择
              </div>
            ) : (
              <div className="mb-3 h-[26px]" />
            )}
            {card.kicker ? (
              <div className="font-mono text-[10px] tracking-[0.2em] text-signal-copper/75">{card.kicker}</div>
            ) : null}
            <div className={`mt-3 text-base font-medium text-white`}>{card.title}</div>
            <div className={`mt-2 text-xs leading-6 ${active ? "text-signal-fog/78" : "text-signal-fog/58"}`}>{card.description}</div>
          </button>
        );
      })}
    </div>
  );
}
