export interface ToggleOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`rounded-[18px] border px-3 py-3 text-left transition ${
              active
                ? "border-signal-copper/28 bg-signal-copper/10 text-white"
                : "border-white/8 bg-white/[0.02] text-signal-fog/60 hover:border-white/14 hover:text-white"
            }`}
          >
            <div className="text-sm font-medium">{item.label}</div>
            {item.hint ? <div className="mt-1 text-[11px] leading-5 opacity-80">{item.hint}</div> : null}
          </button>
        );
      })}
    </div>
  );
}
