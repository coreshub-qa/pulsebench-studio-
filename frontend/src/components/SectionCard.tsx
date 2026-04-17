import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";

export function SectionCard({
  title,
  kicker,
  children,
  className,
  compact,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
  /** compact = true removes the divider and shrinks vertical padding, used for sidebar / secondary cards */
  compact?: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "panel-surface rounded-[28px]",
        compact ? "p-4" : "p-5 md:p-6",
        className,
      )}
    >
      <div className={compact ? "mb-3" : "mb-5"}>
        <div>
          {kicker ? (
            <div className="eyebrow mb-2">{kicker}</div>
          ) : null}
          <h2 className={compact ? "text-lg font-medium text-white" : "section-title"}>{title}</h2>
        </div>
        {compact ? null : <div className="soft-divider mt-5" />}
      </div>
      {children}
    </motion.section>
  );
}
