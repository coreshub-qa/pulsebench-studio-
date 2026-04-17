import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, Expand, LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../lib/api";
import type { RunStatus } from "../lib/types";
import {
  loadAIAnalysisCache,
  loadAIConfig,
  saveAIAnalysisSnapshot,
  saveAIConfig,
  type AIAnalysisSnapshot,
} from "../lib/storage";

type AIAnalysisMode = "overview" | "bottleneck" | "next_step" | "failure";

const BASE_MODES = [
  { value: "overview", label: "整体诊断" },
  { value: "bottleneck", label: "瓶颈判断" },
  { value: "next_step", label: "下一轮建议" },
] as const;

const FAILURE_MODE = { value: "failure", label: "失败诊断" } as const;

const KNOWN_HEADINGS = [
  "总体判断", "关键证据", "风险与结论", "建议动作",
  "瓶颈结论", "证据链", "可能原因", "验证建议",
  "失败结论", "直接证据", "处理建议",
  "建议复测方式", "下一轮优先级", "建议实验清单", "执行顺序说明",
];

function normalizeAIContent(value: string) {
  if (!value.trim()) return "";
  let normalized = value.replace(/\r\n/g, "\n");
  for (const heading of KNOWN_HEADINGS) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(
      new RegExp(`(^|\\n)##\\s*${escaped}\\s+(?=\\S)`, "g"),
      `$1## ${heading}\n`,
    );
  }
  normalized = normalized
    .replace(/([。！？：])\s+(?=##\s)/g, "$1\n\n")
    .replace(/([^\n])\s+-\s+\*\*/g, "$1\n- **")
    .replace(/([^\n])\s+-\s+(?=[^\n*-])/g, "$1\n- ")
    .replace(/([^\n])\s+(\d+\.\s+)/g, "$1\n$2")
    .replace(/\n{3,}/g, "\n\n");
  return normalized.trim();
}

function formatTimestamp(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function emptySnapshot(): AIAnalysisSnapshot {
  return { content: "", question: "", updatedAt: "" };
}

function useAIAnalysis(runId: string, runStatus?: RunStatus | null) {
  const [mode, setMode] = useState<AIAnalysisMode>("overview");
  const [analysisCache, setAnalysisCache] = useState<Record<string, AIAnalysisSnapshot>>(() => loadAIAnalysisCache(runId));
  const [content, setContent] = useState(() => loadAIAnalysisCache(runId).overview?.content ?? "");
  const [question, setQuestion] = useState(() => loadAIAnalysisCache(runId).overview?.question ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean; message: string; endpoint?: string; latencyMs?: number | null; responsePreview?: string | null;
  } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState(() => loadAIConfig().aiBaseUrl);
  const [aiApiKey, setAiApiKey] = useState(() => loadAIConfig().aiApiKey);
  const [aiModel, setAiModel] = useState(() => loadAIConfig().aiModel);

  const modes = useMemo(
    () => (runStatus === "failed" ? [...BASE_MODES, FAILURE_MODE] : [...BASE_MODES]),
    [runStatus],
  );

  useEffect(() => {
    setMode(runStatus === "failed" ? "failure" : "overview");
    const nextCache = loadAIAnalysisCache(runId);
    setAnalysisCache(nextCache);
    const snapshot = nextCache[runStatus === "failed" ? "failure" : "overview"] ?? emptySnapshot();
    setContent(snapshot.content);
    setQuestion(snapshot.question);
  }, [runId, runStatus]);

  useEffect(() => {
    if (!modes.some((item) => item.value === mode)) setMode(modes[0]?.value ?? "overview");
  }, [mode, modes]);

  useEffect(() => {
    const snapshot = analysisCache[mode] ?? emptySnapshot();
    setContent(snapshot.content);
    setQuestion(snapshot.question);
  }, [analysisCache, mode]);

  function persistSnapshot(targetMode: string, nextContent: string, nextQuestion: string) {
    const snapshot: AIAnalysisSnapshot = { content: nextContent, question: nextQuestion, updatedAt: new Date().toISOString() };
    setAnalysisCache((current) => {
      const next = { ...current, [targetMode]: snapshot };
      saveAIAnalysisSnapshot(runId, targetMode, snapshot);
      return next;
    });
  }

  function resetTestResult() { setTestResult(null); }

  async function handleTestConnection() {
    setTesting(true);
    setError(null);
    const aiConfig = { aiBaseUrl, aiApiKey, aiModel };
    saveAIConfig(aiConfig);
    try {
      const result = await api.testAI(aiConfig.aiBaseUrl || aiConfig.aiApiKey || aiConfig.aiModel ? aiConfig : undefined);
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "AI 连接测试失败" });
    } finally {
      setTesting(false);
    }
  }

  async function handleAnalyze(nextMode = mode) {
    setMode(nextMode);
    setLoading(true);
    setError(null);
    setContent("");
    const questionForRun = question;
    persistSnapshot(nextMode, "", questionForRun);
    const aiConfig = { aiBaseUrl, aiApiKey, aiModel };
    saveAIConfig(aiConfig);
    try {
      await api.streamAI(
        runId, nextMode, questionForRun || undefined,
        (chunk) => {
          setContent((current) => {
            const next = current + chunk;
            persistSnapshot(nextMode, next, questionForRun);
            return next;
          });
        },
        aiConfig.aiBaseUrl || aiConfig.aiApiKey || aiConfig.aiModel ? aiConfig : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 分析失败");
    } finally {
      setLoading(false);
    }
  }

  return {
    mode, setMode, modes,
    content, question, setQuestion,
    loading, error, testing, testResult,
    showConfig, setShowConfig,
    aiBaseUrl, setAiBaseUrl, aiApiKey, setAiApiKey, aiModel, setAiModel,
    analysisCache, persistSnapshot, resetTestResult,
    handleTestConnection, handleAnalyze,
  };
}

function ConfigPanel({
  showConfig, setShowConfig,
  aiBaseUrl, setAiBaseUrl, aiApiKey, setAiApiKey, aiModel, setAiModel,
  testing, testResult, resetTestResult, onTestConnection,
}: {
  showConfig: boolean; setShowConfig: (v: boolean) => void;
  aiBaseUrl: string; setAiBaseUrl: (v: string) => void;
  aiApiKey: string; setAiApiKey: (v: string) => void;
  aiModel: string; setAiModel: (v: string) => void;
  testing: boolean;
  testResult: { ok: boolean; message: string; endpoint?: string; latencyMs?: number | null; responsePreview?: string | null } | null;
  resetTestResult: () => void;
  onTestConnection: () => void;
}) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/18">
      <button
        type="button"
        onClick={() => setShowConfig(!showConfig)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-signal-fog/70 transition hover:text-white"
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] tracking-[0.2em] text-signal-copper/70">模型配置</span>
          {aiModel ? <span className="rounded-full bg-signal-copper/10 px-2 py-0.5 text-xs text-signal-copper">{aiModel.trim()}</span> : null}
        </span>
        {showConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {showConfig ? (
        <div className="space-y-3 border-t border-white/5 px-4 pb-4 pt-3">
          <div>
            <label className="mb-1 block text-xs text-signal-fog/50">Base URL</label>
            <input type="text" value={aiBaseUrl} onChange={(e) => { setAiBaseUrl(e.target.value); resetTestResult(); }} placeholder="https://api.openai.com/v1" className="field !rounded-xl !px-3 !py-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-signal-fog/50">API Key</label>
            <input type="password" value={aiApiKey} onChange={(e) => { setAiApiKey(e.target.value); resetTestResult(); }} placeholder="sk-..." className="field !rounded-xl !px-3 !py-2" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-signal-fog/50">模型名称</label>
            <input type="text" value={aiModel} onChange={(e) => { setAiModel(e.target.value); resetTestResult(); }} placeholder="gpt-4o-mini" className="field !rounded-xl !px-3 !py-2" />
          </div>
          <button type="button" onClick={onTestConnection} disabled={testing} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-signal-copper/35 bg-signal-copper/10 px-4 py-2.5 text-sm text-signal-copper transition hover:bg-signal-copper/15 disabled:opacity-50">
            {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {testing ? "测试中..." : "测试连接"}
          </button>
          {testResult ? (
            <div className={`rounded-[16px] border px-4 py-3 text-sm leading-6 ${testResult.ok ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-signal-ember/25 bg-signal-ember/10 text-signal-ember"}`}>
              <div>{testResult.message}</div>
              {testResult.endpoint ? <div className="mt-1 text-xs opacity-80">Endpoint: {testResult.endpoint}</div> : null}
              {typeof testResult.latencyMs === "number" ? <div className="mt-1 text-xs opacity-80">耗时: {testResult.latencyMs} ms</div> : null}
              {testResult.responsePreview ? <div className="mt-1 text-xs opacity-80">返回预览: {testResult.responsePreview}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AnalysisContent({ content, loading, error, mode }: { content: string; loading: boolean; error: string | null; mode: string }) {
  const renderedContent = useMemo(() => normalizeAIContent(content), [content]);
  return (
    <>
      {error ? (
        <div className="rounded-[20px] border border-signal-ember/25 bg-signal-ember/10 px-5 py-5 text-sm leading-7 text-signal-ember">{error}</div>
      ) : loading && !renderedContent ? (
        <div className="space-y-5">
          <div className="h-5 w-32 rounded-full bg-white/8" />
          <div className="h-12 rounded-[22px] bg-white/[0.045]" />
          <div className="h-12 rounded-[22px] bg-white/[0.03]" />
          <div className="h-12 w-4/5 rounded-[22px] bg-white/[0.04]" />
        </div>
      ) : renderedContent ? (
        <div className="rounded-[28px] border border-white/8 bg-black/16 px-7 py-7">
          <div className="ai-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedContent}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-8 text-center text-sm leading-8 text-signal-fog/50">
          {mode === "failure"
            ? "点击「开始失败诊断」生成分析结果。"
            : "点击下方按钮开始 AI 分析。"}
        </div>
      )}
    </>
  );
}

export function AIAnalysisPanel({
  runId,
  runStatus,
  variant = "dialog",
}: {
  runId: string;
  runStatus?: RunStatus | null;
  variant?: "dialog" | "inline";
}) {
  const state = useAIAnalysis(runId, runStatus);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inlineExpanded, setInlineExpanded] = useState(false);

  const activeMode = state.modes.find((item) => item.value === state.mode) ?? state.modes[0] ?? BASE_MODES[0];
  const lastUpdated = state.analysisCache[state.mode]?.updatedAt;

  if (variant === "inline") {
    return (
      <div className="rounded-[28px] border border-white/8 bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setInlineExpanded(!inlineExpanded)}
          className="flex w-full items-center justify-between px-6 py-4"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-signal-copper" />
            <span className="font-display text-lg text-white">AI 分析</span>
            <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs text-signal-fog/60">
              {state.loading ? "生成中..." : state.content ? "已生成" : "待生成"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
                  className="rounded-full border border-white/10 p-1.5 text-signal-fog/50 transition hover:text-white"
                  title="弹出全屏"
                >
                  <Expand className="h-3.5 w-3.5" />
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/72 backdrop-blur-md" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[92vh] w-[94vw] max-w-[1500px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d1216]/96 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
                  <DialogInner state={state} activeMode={activeMode} lastUpdated={lastUpdated} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            {inlineExpanded ? <ChevronUp className="h-4 w-4 text-signal-fog/45" /> : <ChevronDown className="h-4 w-4 text-signal-fog/45" />}
          </div>
        </button>

        {inlineExpanded ? (
          <div className="border-t border-white/6 px-6 pb-6 pt-5">
            <div className="mb-4 flex flex-wrap gap-2">
              {state.modes.map((item) => {
                const cached = state.analysisCache[item.value];
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => state.setMode(item.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${
                      state.mode === item.value
                        ? "border-signal-copper/30 bg-signal-copper/10 text-signal-copper"
                        : "border-white/8 text-signal-fog/60 hover:text-white"
                    }`}
                  >
                    {item.label}
                    {cached?.content ? " ✓" : ""}
                  </button>
                );
              })}
            </div>

            <ConfigPanel
              showConfig={state.showConfig} setShowConfig={state.setShowConfig}
              aiBaseUrl={state.aiBaseUrl} setAiBaseUrl={state.setAiBaseUrl}
              aiApiKey={state.aiApiKey} setAiApiKey={state.setAiApiKey}
              aiModel={state.aiModel} setAiModel={state.setAiModel}
              testing={state.testing} testResult={state.testResult}
              resetTestResult={state.resetTestResult}
              onTestConnection={() => void state.handleTestConnection()}
            />

            <div className="mt-4">
              <AnalysisContent content={state.content} loading={state.loading} error={state.error} mode={state.mode} />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <textarea
                value={state.question}
                onChange={(e) => {
                  state.setQuestion(e.target.value);
                  if (state.analysisCache[state.mode]?.content) {
                    state.persistSnapshot(state.mode, state.analysisCache[state.mode].content, e.target.value);
                  }
                }}
                className="field min-h-[60px] flex-1 !rounded-[18px]"
                placeholder="附加问题（可选）"
                rows={2}
              />
              <button
                type="button"
                onClick={() => void state.handleAnalyze(state.mode)}
                disabled={state.loading || state.testing}
                className="inline-flex shrink-0 items-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-3 text-sm text-signal-copper transition hover:bg-signal-copper/15 disabled:opacity-50"
              >
                {state.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {state.loading ? "分析中..." : `开始${activeMode.label}`}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // Dialog variant (original behavior)
  return (
    <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-2 rounded-full border border-signal-copper/30 bg-signal-copper/10 px-4 py-2 text-sm text-signal-copper transition hover:bg-signal-copper/15">
          <Sparkles className="h-4 w-4" />
          AI 分析工作区
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/72 backdrop-blur-md" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[92vh] w-[94vw] max-w-[1500px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d1216]/96 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <DialogInner state={state} activeMode={activeMode} lastUpdated={lastUpdated} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogInner({
  state,
  activeMode,
  lastUpdated,
}: {
  state: ReturnType<typeof useAIAnalysis>;
  activeMode: { value: string; label: string };
  lastUpdated?: string;
}) {
  const renderedContent = useMemo(() => normalizeAIContent(state.content), [state.content]);

  return (
    <div className="grid h-full w-full gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex h-full flex-col border-r border-white/8 bg-black/18">
        <div className="border-b border-white/8 px-6 pb-5 pt-6">
          <div className="eyebrow">AI Copilot</div>
          <Dialog.Title className="mt-3 font-display text-[36px] leading-none text-white">性能分析工作区</Dialog.Title>
          <p className="mt-4 text-sm leading-7 text-signal-fog/68">分析结果会按 `run + 模式` 自动保存在本地。</p>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          <ConfigPanel
            showConfig={state.showConfig} setShowConfig={state.setShowConfig}
            aiBaseUrl={state.aiBaseUrl} setAiBaseUrl={state.setAiBaseUrl}
            aiApiKey={state.aiApiKey} setAiApiKey={state.setAiApiKey}
            aiModel={state.aiModel} setAiModel={state.setAiModel}
            testing={state.testing} testResult={state.testResult}
            resetTestResult={state.resetTestResult}
            onTestConnection={() => void state.handleTestConnection()}
          />

          <div className="mt-5">
            <div className="mb-3 font-mono text-[11px] tracking-[0.22em] text-signal-copper/76">分析模式</div>
            <div className="space-y-2">
              {state.modes.map((item) => {
                const cached = state.analysisCache[item.value];
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => state.setMode(item.value)}
                    className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${
                      state.mode === item.value
                        ? "border-signal-copper/30 bg-signal-copper/10"
                        : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.045]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white">{item.label}</div>
                      {cached?.content ? <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-signal-fog/60">已缓存</span> : null}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-signal-fog/52">
                      {cached?.updatedAt ? `最近生成于 ${formatTimestamp(cached.updatedAt)}` : "尚未生成"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block font-mono text-[11px] tracking-[0.22em] text-signal-copper/76">附加问题</label>
            <textarea
              value={state.question}
              onChange={(e) => {
                state.setQuestion(e.target.value);
                if (state.analysisCache[state.mode]?.content) {
                  state.persistSnapshot(state.mode, state.analysisCache[state.mode].content, e.target.value);
                }
              }}
              className="field min-h-32 !rounded-[22px]"
              placeholder={state.mode === "failure" ? "可选：补充你最想确认的失败原因或排查方向。" : "可选：补充你这轮最想让 AI 回答的问题。"}
            />
          </div>
        </div>

        <div className="border-t border-white/8 px-6 py-5">
          <button
            type="button"
            onClick={() => void state.handleAnalyze(state.mode)}
            disabled={state.loading || state.testing}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-signal-copper/35 bg-signal-copper/10 px-5 py-3 text-sm text-signal-copper transition hover:bg-signal-copper/15 disabled:opacity-50"
          >
            {state.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {state.loading ? "分析中..." : `开始${activeMode.label}`}
          </button>
        </div>
      </aside>

      <section className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)),rgba(6,9,12,0.35)]">
        <div className="flex items-start justify-between border-b border-white/8 px-6 pb-5 pt-6">
          <div>
            <div className="eyebrow">Analysis Output</div>
            <div className="mt-3 text-[28px] font-medium leading-tight text-white">{activeMode.label}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-signal-fog/58">
              <span>{state.mode === "failure" ? "失败诊断会自动读取 runtime、事件流和原始日志片段" : "结果区域已放大为主要工作区"}</span>
              {lastUpdated ? <span>最近保存于 {formatTimestamp(lastUpdated)}</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs text-signal-fog/65">
              {state.loading ? "流式生成中" : renderedContent ? "已生成" : "等待生成"}
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full border border-white/10 p-2 text-signal-fog/70 transition hover:border-white/20 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <div className="mx-auto max-w-5xl">
            <AnalysisContent content={state.content} loading={state.loading} error={state.error} mode={state.mode} />
          </div>
        </div>
      </section>
    </div>
  );
}

export default AIAnalysisPanel;
