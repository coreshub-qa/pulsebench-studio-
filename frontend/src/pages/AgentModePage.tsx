import { AnimatePresence, motion } from "framer-motion";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { loadAIConfig, loadServiceConfig, saveAIConfig, saveServiceConfig } from "../lib/storage";
import type { AgentStrategyDraft, AgentStrategyResponse } from "../lib/types";
import { AgentPlanReview } from "./agent/AgentPlanReview";
import { AgentWizard } from "./agent/AgentWizard";
import type { PlannerForm } from "./agent/types";

type PagePhase = "idle" | "planning" | "planned" | "executing";

const goalTitles: Record<string, string> = {
  health_check: "首轮验活",
  interactive_experience: "交互体验",
  balanced_throughput: "均衡吞吐",
  long_context: "长上下文",
  capacity_limit: "容量压测",
};

function toOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

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

  const knownSignals = useMemo(
    () =>
      [
        form.parameterScale, form.contextWindow, form.gpuModel,
        form.gpuCount, form.gpuMemoryGb, form.engine,
        form.quantization, form.tokenizerPath,
        form.typicalPromptLength, form.typicalOutputLength,
      ].filter((v) => v.trim()).length,
    [form],
  );

  const handleChange = useCallback((field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  async function handlePlan() {
    if (!form.model.trim() || !form.url.trim()) {
      setError("模型名称与 API 地址为必填项。");
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

  return (
    <>
      <AnimatePresence>
        {phase === "planning" ? (
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
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {phase === "idle" ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {/* Hero */}
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel-surface relative mb-6 overflow-hidden rounded-[32px] p-6 md:p-7"
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
                  <span className="mx-2 text-white">{goalTitles[form.goal]}</span>
                  。按步骤填写信息，最后生成一份可审阅的测试策略草案。
                </p>
              </div>
            </motion.section>

            <AgentWizard
              form={form}
              onChange={handleChange}
              knownSignals={knownSignals}
              error={error}
              onSubmit={() => void handlePlan()}
            />
          </motion.div>
        ) : (
          <motion.div
            key="planned"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <AgentPlanReview
              strategy={strategy}
              error={error}
              goalTitle={goalTitles[form.goal] ?? "--"}
              disabled={phase === "executing"}
              onBack={() => setPhase("idle")}
              onExecute={() => void handleExecute()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
