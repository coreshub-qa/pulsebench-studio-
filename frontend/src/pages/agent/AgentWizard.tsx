import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useState } from "react";
import { GoalStep } from "./steps/GoalStep";
import { ConnectionStep } from "./steps/ConnectionStep";
import { SignalsStep } from "./steps/SignalsStep";
import { PreferencesStep } from "./steps/PreferencesStep";
import { ReviewStep } from "./steps/ReviewStep";
import type { PlannerForm } from "./types";

const STEPS = [
  { key: "goal", label: "目标", kicker: "01" },
  { key: "connection", label: "连接", kicker: "02" },
  { key: "signals", label: "信号", kicker: "03" },
  { key: "preferences", label: "偏好", kicker: "04" },
  { key: "review", label: "确认", kicker: "05" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export function AgentWizard({
  form,
  onChange,
  knownSignals,
  error,
  onSubmit,
}: {
  form: PlannerForm;
  onChange: (field: string, value: string | boolean) => void;
  knownSignals: number;
  error: string | null;
  onSubmit: () => void;
}) {
  const [currentStep, setCurrentStep] = useState<StepKey>("goal");
  const [visitedSteps, setVisitedSteps] = useState<Set<StepKey>>(new Set(["goal"]));

  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  function goTo(step: StepKey) {
    setCurrentStep(step);
    setVisitedSteps((prev) => new Set([...prev, step]));
  }

  function next() {
    if (currentIndex < STEPS.length - 1) {
      goTo(STEPS[currentIndex + 1].key);
    }
  }

  function prev() {
    if (currentIndex > 0) {
      goTo(STEPS[currentIndex - 1].key);
    }
  }

  const canProceed = (step: StepKey): boolean => {
    if (step === "connection") return !!(form.model.trim() && form.url.trim());
    return true;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* Vertical step nav */}
      <nav className="hidden lg:block">
        <div className="sticky top-6 space-y-1">
          {STEPS.map((step, index) => {
            const isActive = step.key === currentStep;
            const isVisited = visitedSteps.has(step.key);
            const isPast = index < currentIndex;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => isVisited ? goTo(step.key) : undefined}
                disabled={!isVisited}
                className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition ${
                  isActive
                    ? "border border-signal-copper/20 bg-signal-copper/8 text-white"
                    : isVisited
                      ? "text-signal-fog/60 hover:bg-white/[0.03] hover:text-white"
                      : "text-signal-fog/30 cursor-default"
                }`}
              >
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-mono ${
                  isPast
                    ? "bg-signal-cyan/15 text-signal-cyan"
                    : isActive
                      ? "bg-signal-copper/20 text-signal-copper"
                      : "bg-white/[0.06] text-signal-fog/40"
                }`}>
                  {isPast ? <Check className="h-3 w-3" /> : step.kicker}
                </div>
                <span className="text-sm">{step.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile step nav */}
      <div className="flex gap-1 overflow-x-auto lg:hidden">
        {STEPS.map((step, index) => {
          const isActive = step.key === currentStep;
          const isPast = index < currentIndex;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => visitedSteps.has(step.key) ? goTo(step.key) : undefined}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
                isActive
                  ? "bg-signal-copper/15 text-signal-copper"
                  : isPast
                    ? "text-signal-cyan/70"
                    : "text-signal-fog/35"
              }`}
            >
              {isPast ? <Check className="h-3 w-3" /> : null}
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
          >
            {currentStep === "goal" && (
              <GoalStep goal={form.goal} onChange={(v) => onChange("goal", v)} />
            )}
            {currentStep === "connection" && (
              <ConnectionStep
                model={form.model}
                url={form.url}
                apiKey={form.apiKey}
                onChange={onChange}
              />
            )}
            {currentStep === "signals" && (
              <SignalsStep form={form} onChange={onChange} />
            )}
            {currentStep === "preferences" && (
              <PreferencesStep
                aggressiveness={form.aggressiveness}
                workloadType={form.workloadType}
                timeBudget={form.timeBudget}
                question={form.question}
                aiBaseUrl={form.aiBaseUrl}
                aiApiKey={form.aiApiKey}
                aiModel={form.aiModel}
                onChange={onChange}
              />
            )}
            {currentStep === "review" && (
              <ReviewStep
                form={form}
                knownSignals={knownSignals}
                error={error}
                onSubmit={onSubmit}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Bottom nav */}
        {currentStep !== "review" && (
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={prev}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-signal-fog transition hover:border-white/20 hover:text-white disabled:opacity-30"
            >
              上一步
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!canProceed(currentStep)}
              className="inline-flex items-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-2.5 text-sm font-medium text-signal-copper transition hover:bg-signal-copper/16 disabled:opacity-40"
            >
              下一步
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
