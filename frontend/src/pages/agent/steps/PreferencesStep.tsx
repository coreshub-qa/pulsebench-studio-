import { ChevronDown } from "lucide-react";
import { SectionCard } from "../../../components/SectionCard";
import { Field } from "../../../components/form/Field";
import { ToggleGroup } from "../../../components/form/ToggleGroup";
import type { AgentAggressiveness, AgentWorkloadType } from "../../../lib/types";

const workloadOptions = [
  { value: "chat_short" as AgentWorkloadType, label: "短问答", hint: "客服、助手、简短对话" },
  { value: "chat_long_output" as AgentWorkloadType, label: "短入长出", hint: "总结、改写、扩写" },
  { value: "rag_medium_context" as AgentWorkloadType, label: "RAG 中等上下文", hint: "带资料检索的问答" },
  { value: "long_context_analysis" as AgentWorkloadType, label: "长上下文分析", hint: "长材料阅读、会议纪要、合同分析" },
  { value: "code_generation" as AgentWorkloadType, label: "代码生成", hint: "函数补全、解释、重构" },
  { value: "unknown" as AgentWorkloadType, label: "暂不确定", hint: "先让 Agent 用保守默认值起步" },
];

const timeBudgetOptions = [
  { value: "quick", label: "快速摸底", hint: "优先在短时间内给出方向" },
  { value: "standard", label: "标准覆盖", hint: "兼顾效率和信息增量" },
  { value: "deep", label: "完整验证", hint: "愿意多花时间换更完整的策略" },
];

const aggressivenessOptions = [
  { value: "conservative" as AgentAggressiveness, label: "保守", hint: "优先稳妥和可解释" },
  { value: "balanced" as AgentAggressiveness, label: "均衡", hint: "默认推荐" },
  { value: "aggressive" as AgentAggressiveness, label: "激进", hint: "更快逼近边界" },
];

export function PreferencesStep({
  aggressiveness,
  workloadType,
  timeBudget,
  question,
  aiBaseUrl,
  aiApiKey,
  aiModel,
  onChange,
}: {
  aggressiveness: AgentAggressiveness;
  workloadType: AgentWorkloadType;
  timeBudget: string;
  question: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionCard title="策略偏好" kicker="Step 04">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <div>
            <div className="mb-3 text-sm font-medium text-white/92">策略风格</div>
            <ToggleGroup
              options={aggressivenessOptions}
              value={aggressiveness}
              onChange={(v) => onChange("aggressiveness", v)}
            />
          </div>

          <Field label="负载类型">
            <select
              value={workloadType}
              onChange={(e) => onChange("workloadType", e.target.value)}
              className="field"
            >
              {workloadOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="mt-2 text-xs leading-6 text-signal-fog/45">
              {workloadOptions.find((item) => item.value === workloadType)?.hint}
            </div>
          </Field>

          <Field label="时间预算">
            <select
              value={timeBudget}
              onChange={(e) => onChange("timeBudget", e.target.value)}
              className="field"
            >
              {timeBudgetOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="mt-2 text-xs leading-6 text-signal-fog/45">
              {timeBudgetOptions.find((item) => item.value === timeBudget)?.hint}
            </div>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="追加问题" kicker="Step 05">
        <Field label="如果你有明确顾虑，可以直接告诉 Agent" hint="可选">
          <input
            value={question}
            onChange={(e) => onChange("question", e.target.value)}
            className="field"
            placeholder="例如：我更关心 4K 入 4K 出的产线基线，不想首轮就把实验面拉得太大。"
          />
        </Field>
      </SectionCard>

      <details className="group rounded-[28px] border border-white/6 bg-white/[0.015]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <div>
            <div className="eyebrow">Advanced</div>
            <div className="mt-1 text-lg font-medium text-white">AI 规划高级设置</div>
          </div>
          <ChevronDown className="h-4 w-4 text-signal-fog/45 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-white/6 px-5 pb-5 pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="AI Base URL">
              <input value={aiBaseUrl} onChange={(e) => onChange("aiBaseUrl", e.target.value)} className="field" placeholder="可选" />
            </Field>
            <Field label="AI API Key">
              <input type="password" value={aiApiKey} onChange={(e) => onChange("aiApiKey", e.target.value)} className="field" placeholder="可选" />
            </Field>
            <Field label="AI 模型名">
              <input value={aiModel} onChange={(e) => onChange("aiModel", e.target.value)} className="field" placeholder="可选" />
            </Field>
          </div>
        </div>
      </details>
    </div>
  );
}
