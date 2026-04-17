import { ArrowLeft, ArrowRight } from "lucide-react";
import { SectionCard } from "../../components/SectionCard";
import type { AgentStrategyDraft, AgentStrategyResponse } from "../../lib/types";

function ConfidencePill({ confidence }: { confidence: AgentStrategyDraft["confidence"] }) {
  const tone =
    confidence === "high"
      ? "border-signal-cyan/25 bg-signal-cyan/10 text-signal-cyan"
      : confidence === "medium"
        ? "border-signal-copper/22 bg-signal-copper/10 text-signal-copper"
        : "border-white/10 bg-white/[0.04] text-signal-fog/68";
  return <span className={`inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${tone}`}>{confidence}</span>;
}

function MiniMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-white/6 bg-white/[0.02] px-3 py-2">
      <span className="font-mono text-[10px] tracking-[0.2em] text-signal-fog/50">{title}</span>
      <span className="text-sm font-medium text-white">{value || "--"}</span>
    </div>
  );
}

function DraftHeader({ draft }: { draft: AgentStrategyDraft }) {
  return (
    <SectionCard title="策略摘要" kicker="Draft Overview">
      <div className="rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[30px] leading-tight text-white font-display">{draft.title}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/8 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-signal-fog/58">
                {draft.strategyType}
              </span>
              {draft.focusMetrics.map((item) => (
                <span key={item} className="rounded-full border border-white/8 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-signal-fog/58">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <ConfidencePill confidence={draft.confidence} />
        </div>
        <div className="mt-5 text-sm leading-8 text-signal-fog/68">{draft.summary}</div>
      </div>
    </SectionCard>
  );
}

function GuardrailsBar({ strategy }: { strategy: AgentStrategyResponse }) {
  return (
    <SectionCard title="Guardrails" kicker="Planning Boundaries">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MiniMetric title="模板基型" value={strategy.guardrails.templateBasis} />
        <MiniMetric title="首选数据集" value={strategy.guardrails.preferredDataset} />
        <MiniMetric title="并发梯度" value={strategy.guardrails.recommendedConcurrency.join(" / ")} />
        <MiniMetric title="Prompt 范围" value={`${strategy.guardrails.promptRange.min} - ${strategy.guardrails.promptRange.max}`} />
      </div>
    </SectionCard>
  );
}

function RunCard({ index, run }: { index: number; run: AgentStrategyDraft["runs"][number] }) {
  return (
    <SectionCard title={run.label} kicker={`Run 0${index + 1}`}>
      <div className="space-y-4">
        <div className="text-base leading-8 text-white">{run.objective}</div>
        <div className="rounded-[18px] border border-white/8 bg-black/16 px-4 py-3 text-sm italic leading-7 text-signal-fog/56">
          {run.reasoning}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MiniMetric title="数据集" value={run.spec.dataset} />
          <MiniMetric title="输入范围" value={`${run.spec.minPromptLength} - ${run.spec.maxPromptLength}`} />
          <MiniMetric title="输出范围" value={`${run.spec.minTokens} - ${run.spec.maxTokens}`} />
          <MiniMetric title="并发阶梯" value={run.spec.parallel.join(" / ")} />
          <MiniMetric title="请求数" value={run.spec.number.join(" / ")} />
        </div>
      </div>
    </SectionCard>
  );
}

function AssumptionsWarnings({ assumptions, warnings }: { assumptions: string[]; warnings: string[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard title="关键假设" kicker="Assumptions">
        {assumptions.length > 0 ? (
          <ul className="space-y-2 text-sm leading-7 text-signal-fog/62">
            {assumptions.map((item) => (
              <li key={item} className="rounded-[16px] border border-signal-cyan/16 bg-signal-cyan/8 px-3 py-2.5 text-signal-fog/82">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm leading-7 text-signal-fog/54">当前没有额外假设说明。</div>
        )}
      </SectionCard>
      <SectionCard title="风险提示" kicker="Warnings">
        {warnings.length > 0 ? (
          <ul className="space-y-2 text-sm leading-7 text-signal-fog/62">
            {warnings.map((item) => (
              <li key={item} className="rounded-[16px] border border-signal-copper/16 bg-signal-copper/6 px-3 py-2.5 text-signal-fog/82">
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm leading-7 text-signal-fog/54">当前没有额外风险提示。</div>
        )}
      </SectionCard>
    </div>
  );
}

export function AgentPlanReview({
  strategy,
  error,
  goalTitle,
  disabled,
  onBack,
  onExecute,
}: {
  strategy: AgentStrategyResponse | null;
  error: string | null;
  goalTitle: string;
  disabled: boolean;
  onBack: () => void;
  onExecute: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {strategy ? (
          <>
            <DraftHeader draft={strategy.draft} />
            <GuardrailsBar strategy={strategy} />
            <div className="space-y-4">
              {strategy.draft.runs.map((run, index) => (
                <RunCard key={`${run.label}-${index}`} index={index} run={run} />
              ))}
            </div>
            <AssumptionsWarnings assumptions={strategy.draft.assumptions} warnings={strategy.draft.warnings} />
          </>
        ) : (
          <SectionCard title="本轮没有生成可审阅草案" kicker="Plan Failed">
            <div className="rounded-[24px] border border-signal-ember/24 bg-signal-ember/8 p-5">
              <div className="text-lg font-medium text-white">Agent 本轮没有给出可执行策略</div>
              <div className="mt-3 text-sm leading-8 text-signal-fog/68">
                {error ?? "请返回上一步调整连接信息或补充更多环境信号后再重新生成。"}
              </div>
            </div>
          </SectionCard>
        )}
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <SectionCard title="执行面板" kicker="Decision" compact>
          <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
            <div className="text-base font-medium text-white">{strategy?.draft.title ?? "等待重新规划"}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded-full border border-white/8 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-signal-fog/58">
                {goalTitle}
              </span>
              {strategy?.draft ? <ConfidencePill confidence={strategy.draft.confidence} /> : null}
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-white/8 bg-black/16 px-4 py-3">
            <div className="font-mono text-[10px] tracking-[0.18em] text-signal-copper/72">Current Goal</div>
            <div className="mt-2 text-sm text-white">{goalTitle}</div>
            <button
              type="button"
              onClick={onBack}
              disabled={disabled}
              className="mt-3 inline-flex items-center gap-2 text-xs text-signal-fog/56 transition hover:text-white disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回修改条件
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-[18px] border border-signal-ember/30 bg-signal-ember/10 px-4 py-3 text-sm leading-7 text-signal-ember">
              {error}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={disabled}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-signal-fog transition hover:border-white/20 hover:text-white disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              重新规划
            </button>
            <button
              type="button"
              onClick={onExecute}
              disabled={!strategy?.draft || disabled}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-signal-cyan/35 bg-signal-cyan/10 px-5 py-3 text-sm font-medium text-signal-cyan transition hover:bg-signal-cyan/16 disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" />
              {disabled ? "执行中..." : "直接执行"}
            </button>
          </div>

          <div className="mt-4 rounded-[18px] border border-white/8 bg-black/16 px-4 py-3 text-xs leading-6 text-signal-fog/52">
            当前阶段不会自动开跑。只有当你确认草案后，系统才会把它转换为 batch 并进入运行页。
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
