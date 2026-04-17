import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronDown, FlaskConical, LoaderCircle, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import { loadAIConfig, loadServiceConfig, saveAIConfig, saveServiceConfig } from "../lib/storage";
import type { AgentAggressiveness, AgentGoal, AgentStrategyDraft, AgentStrategyResponse, AgentWorkloadType } from "../lib/types";

type PlannerForm = {
  goal: AgentGoal;
  model: string;
  url: string;
  apiKey: string;
  parameterScale: string;
  contextWindow: string;
  gpuModel: string;
  gpuCount: string;
  gpuMemoryGb: string;
  engine: string;
  quantization: string;
  tokenizerPath: string;
  workloadType: AgentWorkloadType;
  typicalPromptLength: string;
  typicalOutputLength: string;
  stream: boolean;
  timeBudget: string;
  aggressiveness: AgentAggressiveness;
  question: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
};

type PagePhase = "idle" | "planning" | "planned" | "executing";

const goalCards: Array<{
  value: AgentGoal;
  title: string;
  kicker: string;
  description: string;
}> = [
  {
    value: "health_check",
    title: "首轮验活",
    kicker: "Fast Pass",
    description: "先确认服务是否健康，避免一开始就把实验面铺太大。",
  },
  {
    value: "interactive_experience",
    title: "交互体验",
    kicker: "Human Feel",
    description: "优先关注首 Token、平均延迟和日常问答的等待感。",
  },
  {
    value: "balanced_throughput",
    title: "均衡吞吐",
    kicker: "Production Fit",
    description: "围绕典型生产负载寻找吞吐和延迟的平衡点。",
  },
  {
    value: "long_context",
    title: "长上下文",
    kicker: "Context Edge",
    description: "验证长输入条件下的 TTFT、稳定性和接近上限行为。",
  },
  {
    value: "capacity_limit",
    title: "容量压测",
    kicker: "Stress Curve",
    description: "寻找最大稳定并发区间，明确系统的容量边界。",
  },
];

const workloadOptions: Array<{ value: AgentWorkloadType; label: string; hint: string }> = [
  { value: "chat_short", label: "短问答", hint: "客服、助手、简短对话" },
  { value: "chat_long_output", label: "短入长出", hint: "总结、改写、扩写" },
  { value: "rag_medium_context", label: "RAG 中等上下文", hint: "带资料检索的问答" },
  { value: "long_context_analysis", label: "长上下文分析", hint: "长材料阅读、会议纪要、合同分析" },
  { value: "code_generation", label: "代码生成", hint: "函数补全、解释、重构" },
  { value: "unknown", label: "暂不确定", hint: "先让 Agent 用保守默认值起步" },
];

const timeBudgetOptions = [
  { value: "quick", label: "快速摸底", hint: "优先在短时间内给出方向" },
  { value: "standard", label: "标准覆盖", hint: "兼顾效率和信息增量" },
  { value: "deep", label: "完整验证", hint: "愿意多花时间换更完整的策略" },
];

const initialForm = (): PlannerForm => {
  const service = loadServiceConfig();
  const ai = loadAIConfig();
  return {
    goal: "balanced_throughput",
    model: service.model,
    url: service.url,
    apiKey: service.apiKey,
    parameterScale: "",
    contextWindow: "",
    gpuModel: "",
    gpuCount: "",
    gpuMemoryGb: "",
    engine: "",
    quantization: "",
    tokenizerPath: service.tokenizerPath,
    workloadType: "unknown",
    typicalPromptLength: "",
    typicalOutputLength: "",
    stream: true,
    timeBudget: "standard",
    aggressiveness: "balanced",
    question: "",
    aiBaseUrl: ai.aiBaseUrl,
    aiApiKey: ai.aiApiKey,
    aiModel: ai.aiModel,
  };
};

function toOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function AgentModePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<PlannerForm>(initialForm);
  const [strategy, setStrategy] = useState<AgentStrategyResponse | null>(null);
  const [phase, setPhase] = useState<PagePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveServiceConfig({
        model: form.model,
        url: form.url,
        apiKey: form.apiKey,
        tokenizerPath: form.tokenizerPath,
        datasetPath: "",
      });
      saveAIConfig({
        aiBaseUrl: form.aiBaseUrl,
        aiApiKey: form.aiApiKey,
        aiModel: form.aiModel,
      });
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [form]);

  const validation = useMemo(() => {
    if (!form.model.trim() || !form.url.trim()) return "模型名称与 API 地址为必填项。";
    return null;
  }, [form.model, form.url]);

  const knownSignals = useMemo(
    () =>
      [
        form.parameterScale,
        form.contextWindow,
        form.gpuModel,
        form.gpuCount,
        form.gpuMemoryGb,
        form.engine,
        form.quantization,
        form.tokenizerPath,
        form.typicalPromptLength,
        form.typicalOutputLength,
      ].filter((item) => item.trim()).length,
    [form],
  );

  async function handlePlan() {
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setPhase("planning");
    try {
      const response = await api.planAgentStrategy({
        goal: form.goal,
        model: form.model.trim(),
        url: form.url.trim(),
        apiKey: form.apiKey.trim() || undefined,
        parameterScale: form.parameterScale.trim() || undefined,
        contextWindow: toOptionalInt(form.contextWindow),
        gpuModel: form.gpuModel.trim() || undefined,
        gpuCount: toOptionalInt(form.gpuCount),
        gpuMemoryGb: toOptionalInt(form.gpuMemoryGb),
        engine: form.engine.trim() || undefined,
        quantization: form.quantization.trim() || undefined,
        tokenizerPath: form.tokenizerPath.trim() || undefined,
        workloadType: form.workloadType,
        typicalPromptLength: toOptionalInt(form.typicalPromptLength),
        typicalOutputLength: toOptionalInt(form.typicalOutputLength),
        stream: form.stream,
        timeBudget: form.timeBudget.trim() || undefined,
        aggressiveness: form.aggressiveness,
        question: form.question.trim() || undefined,
        aiBaseUrl: form.aiBaseUrl.trim() || undefined,
        aiApiKey: form.aiApiKey.trim() || undefined,
        aiModel: form.aiModel.trim() || undefined,
      });
      setStrategy(response);
      setPhase("planned");
    } catch (err) {
      setStrategy(null);
      setError(err instanceof Error ? err.message : "策略生成失败");
      setPhase("planned");
    }
  }

  function hydrateDraftForExecution(draft: AgentStrategyDraft): AgentStrategyDraft {
    return {
      ...draft,
      runs: draft.runs.map((run) => ({
        ...run,
        spec: {
          ...run.spec,
          model: form.model.trim(),
          url: form.url.trim(),
          apiKey: form.apiKey.trim() || undefined,
          tokenizerPath: run.spec.dataset === "random" ? form.tokenizerPath.trim() || undefined : undefined,
        },
      })),
    };
  }

  async function handleExecute() {
    if (!strategy) return;
    setError(null);
    setPhase("executing");
    try {
      const manifest = await api.executeAgentStrategy({
        draft: hydrateDraftForExecution(strategy.draft),
      });
      navigate(`/batch/${manifest.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动 Agent 批次失败");
      setPhase("planned");
    }
  }

  function handleBackToEdit() {
    setPhase("idle");
  }

  const heroGoal = goalCards.find((item) => item.value === form.goal);

  return (
    <>
      <AnimatePresence>
        {phase === "planning" ? <PlanningOverlay /> : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === "idle" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="pb-32"
          >
            <div className="mx-auto max-w-3xl space-y-6">
              <motion.section
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                className="panel-surface relative overflow-hidden rounded-[32px] p-6 md:p-7"
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(110,203,184,0.14),transparent_28%),radial-gradient(circle_at_88%_24%,rgba(200,154,91,0.14),transparent_30%),linear-gradient(125deg,rgba(255,255,255,0.03),transparent_52%)]" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full border border-signal-copper/20 bg-signal-copper/10 px-3 py-1 font-mono text-[10px] tracking-[0.22em] text-signal-copper/82">
                    <Sparkles className="h-3 w-3" />
                    AGENT DIRECTOR
                  </div>
                  <h1 className="mt-4 max-w-2xl font-display text-[32px] leading-[1.08] text-white md:text-[44px]">
                    一次只做一个决定。
                    <br />
                    先让 Agent 帮你拼首轮实验。
                  </h1>
                  <p className="mt-4 max-w-2xl text-[15px] leading-8 text-signal-fog/66">
                    当前目标是
                    <span className="mx-2 text-white">{heroGoal?.title}</span>
                    。先填最必要的信息，再按需补充环境信号，最后生成一份可以审阅和执行的测试策略草案。
                  </p>
                </div>
              </motion.section>

              <GoalGrid goal={form.goal} onChange={(goal) => setForm((current) => ({ ...current, goal }))} />

              <SectionCard title="必填信息" kicker="Step 02">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="模型名称" required>
                    <input
                      value={form.model}
                      onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                      className="field"
                      placeholder="Qwen-32B / GLM-4.5-Air"
                    />
                  </Field>
                  <Field label="API 地址" required>
                    <input
                      value={form.url}
                      onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                      className="field"
                      placeholder="https://host/v1"
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="API Key" hint="可选">
                    <input
                      type="password"
                      value={form.apiKey}
                      onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                      className="field"
                      placeholder="sk-..."
                    />
                  </Field>
                </div>

                <div className="mt-5">
                  <SignalCompleteness count={knownSignals} total={10} />
                </div>
              </SectionCard>

              <CollapsibleSignals
                form={form}
                onChange={setForm}
                count={knownSignals}
              />

              <SectionCard title="策略偏好" kicker="Step 04">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
                  <div>
                    <div className="mb-3 text-sm font-medium text-white/92">策略风格</div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[
                        { value: "conservative", label: "保守", hint: "优先稳妥和可解释" },
                        { value: "balanced", label: "均衡", hint: "默认推荐" },
                        { value: "aggressive", label: "激进", hint: "更快逼近边界" },
                      ].map((item) => {
                        const active = form.aggressiveness === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, aggressiveness: item.value as AgentAggressiveness }))}
                            className={`rounded-[18px] border px-3 py-3 text-left transition ${
                              active
                                ? "border-signal-copper/28 bg-signal-copper/10 text-white"
                                : "border-white/8 bg-white/[0.02] text-signal-fog/60 hover:border-white/14 hover:text-white"
                            }`}
                          >
                            <div className="text-sm font-medium">{item.label}</div>
                            <div className="mt-1 text-[11px] leading-5 opacity-80">{item.hint}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field label="负载类型">
                    <select
                      value={form.workloadType}
                      onChange={(event) => setForm((current) => ({ ...current, workloadType: event.target.value as AgentWorkloadType }))}
                      className="field"
                    >
                      {workloadOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs leading-6 text-signal-fog/45">
                      {workloadOptions.find((item) => item.value === form.workloadType)?.hint}
                    </div>
                  </Field>

                  <Field label="时间预算">
                    <select
                      value={form.timeBudget}
                      onChange={(event) => setForm((current) => ({ ...current, timeBudget: event.target.value }))}
                      className="field"
                    >
                      {timeBudgetOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs leading-6 text-signal-fog/45">
                      {timeBudgetOptions.find((item) => item.value === form.timeBudget)?.hint}
                    </div>
                  </Field>
                </div>
              </SectionCard>

              <SectionCard title="追加问题" kicker="Step 05">
                <Field label="如果你有明确顾虑，可以直接告诉 Agent" hint="可选">
                  <input
                    value={form.question}
                    onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
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
                      <input
                        value={form.aiBaseUrl}
                        onChange={(event) => setForm((current) => ({ ...current, aiBaseUrl: event.target.value }))}
                        className="field"
                        placeholder="可选"
                      />
                    </Field>
                    <Field label="AI API Key">
                      <input
                        type="password"
                        value={form.aiApiKey}
                        onChange={(event) => setForm((current) => ({ ...current, aiApiKey: event.target.value }))}
                        className="field"
                        placeholder="可选"
                      />
                    </Field>
                    <Field label="AI 模型名">
                      <input
                        value={form.aiModel}
                        onChange={(event) => setForm((current) => ({ ...current, aiModel: event.target.value }))}
                        className="field"
                        placeholder="可选"
                      />
                    </Field>
                  </div>
                </div>
              </details>
            </div>

            <div className="sticky bottom-4 z-20 mt-8">
              <div className="mx-auto max-w-3xl rounded-[22px] border border-white/8 bg-[#0b0f12]/86 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <SignalCompleteness count={knownSignals} total={10} compact />
                  <div className="flex items-center gap-3">
                    {error ? <div className="text-xs text-signal-ember">{error}</div> : null}
                    <button
                      type="button"
                      onClick={() => void handlePlan()}
                      className="inline-flex items-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-3 text-sm font-medium text-signal-copper transition hover:bg-signal-copper/16"
                    >
                      生成测试策略
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="planned"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"
          >
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

            <ExecutionPanel
              goal={heroGoal?.title ?? "--"}
              draft={strategy?.draft ?? null}
              error={error}
              disabled={phase === "executing"}
              onBack={handleBackToEdit}
              onExecute={() => void handleExecute()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function GoalGrid({ goal, onChange }: { goal: AgentGoal; onChange: (goal: AgentGoal) => void }) {
  return (
    <SectionCard title="测试目标" kicker="Step 01">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {goalCards.map((card) => {
          const active = goal === card.value;
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
              <div className="font-mono text-[10px] tracking-[0.2em] text-signal-copper/75">{card.kicker}</div>
              <div className={`mt-3 text-base font-medium ${active ? "text-white" : "text-white"}`}>{card.title}</div>
              <div className={`mt-2 text-xs leading-6 ${active ? "text-signal-fog/78" : "text-signal-fog/58"}`}>{card.description}</div>
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

function SignalCompleteness({ count, total, compact = false }: { count: number; total: number; compact?: boolean }) {
  const ratio = Math.min(100, Math.max(0, (count / total) * 100));
  return (
    <div className={compact ? "min-w-[220px]" : ""}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white/92">信号完整度</div>
        <div className="font-mono text-[11px] tracking-[0.18em] text-signal-copper/78">
          {count}/{total}
        </div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,rgba(110,203,184,0.9),rgba(200,154,91,0.88))]"
          style={{ width: `${ratio}%` }}
        />
      </div>
      {!compact ? (
        <div className="mt-2 text-xs leading-6 text-signal-fog/48">
          信号越完整，Agent 给出的并发梯度、长度边界和风险提示越可靠。
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSignals({
  form,
  onChange,
  count,
}: {
  form: PlannerForm;
  onChange: React.Dispatch<React.SetStateAction<PlannerForm>>;
  count: number;
}) {
  const optionalCount = Math.max(0, count);
  return (
    <details className="group rounded-[28px] border border-white/6 bg-white/[0.015]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div>
          <div className="eyebrow">Step 03</div>
          <div className="mt-1 text-lg font-medium text-white">可选信号</div>
          <div className="mt-1 text-sm text-signal-fog/52">已填 {optionalCount} 项，展开后补充更多环境与负载细节。</div>
        </div>
        <ChevronDown className="h-4 w-4 text-signal-fog/45 transition group-open:rotate-180" />
      </summary>

      <div className="border-t border-white/6 px-5 pb-5 pt-4">
        <div className="space-y-5">
          <SignalGroup title="硬件信息">
            <Field label="参数量">
              <input
                value={form.parameterScale}
                onChange={(event) => onChange((current) => ({ ...current, parameterScale: event.target.value }))}
                className="field"
                placeholder="例如 7B / 32B / 72B"
              />
            </Field>
            <Field label="上下文窗口">
              <input
                value={form.contextWindow}
                onChange={(event) => onChange((current) => ({ ...current, contextWindow: event.target.value }))}
                className="field"
                placeholder="例如 32768 / 131072"
              />
            </Field>
            <Field label="GPU 型号">
              <input
                value={form.gpuModel}
                onChange={(event) => onChange((current) => ({ ...current, gpuModel: event.target.value }))}
                className="field"
                placeholder="H100 / A100 / 4090"
              />
            </Field>
            <Field label="GPU 数量">
              <input
                value={form.gpuCount}
                onChange={(event) => onChange((current) => ({ ...current, gpuCount: event.target.value }))}
                className="field"
                placeholder="1 / 4 / 8"
              />
            </Field>
            <Field label="单卡显存 (GB)">
              <input
                value={form.gpuMemoryGb}
                onChange={(event) => onChange((current) => ({ ...current, gpuMemoryGb: event.target.value }))}
                className="field"
                placeholder="24 / 48 / 80"
              />
            </Field>
          </SignalGroup>

          <SignalGroup title="引擎配置">
            <Field label="推理引擎">
              <input
                value={form.engine}
                onChange={(event) => onChange((current) => ({ ...current, engine: event.target.value }))}
                className="field"
                placeholder="vLLM / SGLang / TGI"
              />
            </Field>
            <Field label="量化方式">
              <input
                value={form.quantization}
                onChange={(event) => onChange((current) => ({ ...current, quantization: event.target.value }))}
                className="field"
                placeholder="bf16 / int4 / awq / fp8"
              />
            </Field>
            <Field label="Tokenizer 路径">
              <input
                value={form.tokenizerPath}
                onChange={(event) => onChange((current) => ({ ...current, tokenizerPath: event.target.value }))}
                className="field"
                placeholder="/models/Qwen-32B"
              />
            </Field>
          </SignalGroup>

          <SignalGroup title="负载画像">
            <Field label="典型输入长度">
              <input
                value={form.typicalPromptLength}
                onChange={(event) => onChange((current) => ({ ...current, typicalPromptLength: event.target.value }))}
                className="field"
                placeholder="例如 2048 / 8192 / 32768"
              />
            </Field>
            <Field label="典型输出长度">
              <input
                value={form.typicalOutputLength}
                onChange={(event) => onChange((current) => ({ ...current, typicalOutputLength: event.target.value }))}
                className="field"
                placeholder="例如 1024 / 4096"
              />
            </Field>
            <label className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-signal-fog/75">
              <input
                type="checkbox"
                checked={form.stream}
                onChange={(event) => onChange((current) => ({ ...current, stream: event.target.checked }))}
                className="h-4 w-4 accent-[#c89a5b]"
              />
              目标服务默认按流式返回假设规划
            </label>
          </SignalGroup>
        </div>
      </div>
    </details>
  );
}

function SignalGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-sm font-medium text-white/92">{title}</div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

function PlanningOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0f12]/90 backdrop-blur-sm"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-signal-copper/20 bg-signal-copper/10 text-signal-copper">
        <LoaderCircle className="h-8 w-8 animate-spin" />
      </div>
      <p className="mt-6 font-display text-2xl text-white">Agent 策略引擎规划中...</p>
      <p className="mt-2 text-sm text-signal-fog/62">正在根据硬件与负载画像推导测试矩阵</p>
    </motion.div>
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

function ExecutionPanel({
  goal,
  draft,
  error,
  disabled,
  onBack,
  onExecute,
}: {
  goal: string;
  draft: AgentStrategyDraft | null;
  error: string | null;
  disabled: boolean;
  onBack: () => void;
  onExecute: () => void;
}) {
  return (
    <div className="xl:sticky xl:top-6 xl:self-start">
      <SectionCard title="执行面板" kicker="Decision" compact>
        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
          <div className="text-base font-medium text-white">{draft?.title ?? "等待重新规划"}</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full border border-white/8 px-3 py-1 font-mono text-[10px] tracking-[0.18em] text-signal-fog/58">
              {goal}
            </span>
            {draft ? <ConfidencePill confidence={draft.confidence} /> : null}
          </div>
        </div>

        <div className="mt-4 rounded-[18px] border border-white/8 bg-black/16 px-4 py-3">
          <div className="font-mono text-[10px] tracking-[0.18em] text-signal-copper/72">Current Goal</div>
          <div className="mt-2 text-sm text-white">{goal}</div>
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
            disabled={!draft || disabled}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-signal-cyan/35 bg-signal-cyan/10 px-5 py-3 text-sm font-medium text-signal-cyan transition hover:bg-signal-cyan/16 disabled:opacity-40"
          >
            {disabled ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {disabled ? "执行中..." : "直接执行"}
          </button>
        </div>

        <div className="mt-4 rounded-[18px] border border-white/8 bg-black/16 px-4 py-3 text-xs leading-6 text-signal-fog/52">
          当前阶段不会自动开跑。只有当你确认草案后，系统才会把它转换为 batch 并进入运行页。
        </div>
      </SectionCard>
    </div>
  );
}

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

function Field({
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
