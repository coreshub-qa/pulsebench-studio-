import type { ReactNode } from "react";

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white/92">
          {label}
          {required ? <span className="ml-1 text-signal-copper">*</span> : null}
        </span>
        {hint ? <span className="text-[11px] text-signal-fog/42">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}
