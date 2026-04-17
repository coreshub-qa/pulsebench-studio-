import { ArrowRight } from "lucide-react";
import { SectionCard } from "../../../components/SectionCard";
import type { AgentGoal, AgentAggressiveness, AgentWorkloadType } from "../../../lib/types";

const goalLabels: Record<AgentGoal, string> = {
  health_check: "首轮验活",
  interactive_experience: "交互体验",
  balanced_throughput: "均衡吞吐",
  long_context: "长上下文",
  capacity_limit: "容量压测",
};

const aggressivenessLabels: Record<AgentAggressiveness, string> = {
  conservative: "保守",
  balanced: "均衡",
  aggressive: "激进",
};

const workloadLabels: Record<AgentWorkloadType, string> = {
  chat_short: "短问答",
  chat_long_output: "短入长出",
  rag_medium_context: "RAG 中等上下文",
  long_context_analysis: "长上下文分析",
  code_generation: "代码生成",
  unknown: "暂不确定",
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[14px] border border-white/6 bg-white/[0.02] px-3 py-2">
      <span className="font-mono text-[10px] tracking-[0.2em] text-signal-fog/50">{label}</span>
      <span className="text-sm font-medium text-white">{value || "--"}</span>
    </div>
  );
}

export function ReviewStep({
  form,
  knownSignals,
  error,
  onSubmit,
}: {
  form: {
    goal: AgentGoal;
    model: string;
    url: string;
    aggressiveness: AgentAggressiveness;
    workloadType: AgentWorkloadType;
    timeBudget: string;
    gpuModel: string;
    gpuCount: string;
    engine: string;
    quantization: string;
    question: string;
  };
  knownSignals: number;
  error: string | null;
  onSubmit: () => void;
}) {
  const timeBudgetLabels: Record<string, string> = {
    quick: "快速摸底",
    standard: "标准覆盖",
    deep: "完整验证",
  };

  return (
    <SectionCard title="确认并生成策略" kicker="Review">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SummaryRow label="测试目标" value={goalLabels[form.goal]} />
          <SummaryRow label="模型" value={form.model} />
          <SummaryRow label="API 地址" value={form.url} />
          <SummaryRow label="策略风格" value={aggressivenessLabels[form.aggressiveness]} />
          <SummaryRow label="负载类型" value={workloadLabels[form.workloadType]} />
          <SummaryRow label="时间预算" value={timeBudgetLabels[form.timeBudget] ?? form.timeBudget} />
        </div>

        {(form.gpuModel || form.engine || form.quantization) ? (
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryRow label="GPU" value={form.gpuModel ? `${form.gpuModel} ×${form.gpuCount || "?"}` : "--"} />
            <SummaryRow label="引擎" value={form.engine} />
            <SummaryRow label="量化" value={form.quantization} />
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.02] px-4 py-3">
          <div className="text-sm text-signal-fog/60">
            信号完整度 <span className="ml-2 font-mono text-signal-copper">{knownSignals}/10</span>
          </div>
        </div>

        {form.question ? (
          <div className="rounded-[18px] border border-white/8 bg-black/16 px-4 py-3 text-sm italic leading-7 text-signal-fog/56">
            &ldquo;{form.question}&rdquo;
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[18px] border border-signal-ember/30 bg-signal-ember/10 px-4 py-3 text-sm text-signal-ember">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-3.5 text-sm font-medium text-signal-copper transition hover:bg-signal-copper/16"
        >
          生成测试策略
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </SectionCard>
  );
}
