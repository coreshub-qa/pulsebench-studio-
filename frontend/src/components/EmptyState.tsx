import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.015] px-8 py-12 text-center">
      {icon ? (
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/8 bg-white/[0.03] text-signal-copper">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-xl text-white">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-7 text-signal-fog/55">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
