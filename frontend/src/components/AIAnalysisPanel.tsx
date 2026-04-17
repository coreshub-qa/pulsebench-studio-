import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, LoaderCircle, Sparkles, X } from "lucide-react";
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
  "总体判断",
  "关键证据",
  "风险与结论",
  "建议动作",
  "瓶颈结论",
  "证据链",
  "可能原因",
  "验证建议",
  "失败结论",
  "直接证据",
  "处理建议",
  "建议复测方式",
  "下一轮优先级",
  "建议实验清单",
  "执行顺序说明",
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
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function emptySnapshot(): AIAnalysisSnapshot {
  return {
    content: "",
    question: "",
    updatedAt: "",
  };
}

export function AIAnalysisPanel({ runId, runStatus }: { runId: string; runStatus?: RunStatus | null }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AIAnalysisMode>("overview");
  const [analysisCache, setAnalysisCache] = useState<Record<string, AIAnalysisSnapshot>>(() => loadAIAnalysisCache(runId));
  const [content, setContent] = useState(() => loadAIAnalysisCache(runId).overview?.content ?? "");
  const [question, setQuestion] = useState(() => loadAIAnalysisCache(runId).overview?.question ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    endpoint?: string;
    latencyMs?: number | null;
    responsePreview?: string | null;
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
    if (!modes.some((item) => item.value === mode)) {
      setMode(modes[0]?.value ?? "overview");
    }
  }, [mode, modes]);

  useEffect(() => {
    const snapshot = analysisCache[mode] ?? emptySnapshot();
    setContent(snapshot.content);
    setQuestion(snapshot.question);
  }, [analysisCache, mode]);

  function persistSnapshot(targetMode: string, nextContent: string, nextQuestion: string) {
    const snapshot: AIAnalysisSnapshot = {
      content: nextContent,
      question: nextQuestion,
      updatedAt: new Date().toISOString(),
    };
    setAnalysisCache((current) => {
      const next = { ...current, [targetMode]: snapshot };
      saveAIAnalysisSnapshot(runId, targetMode, snapshot);
      return next;
    });
  }

  function resetTestResult() {
    setTestResult(null);
  }

  async function handleTestConnection() {
    setTesting(true);
    setError(null);
    const aiConfig = { aiBaseUrl, aiApiKey, aiModel };
    saveAIConfig(aiConfig);
    try {
      const result = await api.testAI(
        aiConfig.aiBaseUrl || aiConfig.aiApiKey || aiConfig.aiModel ? aiConfig : undefined,
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "AI 连接测试失败",
      });
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
        runId,
        nextMode,
        questionForRun || undefined,
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

  const activeMode = modes.find((item) => item.value === mode) ?? modes[0] ?? BASE_MODES[0];
  const renderedContent = useMemo(() => normalizeAIContent(content), [content]);
  const lastUpdated = analysisCache[mode]?.updatedAt;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-2 rounded-full border border-signal-copper/30 bg-signal-copper/10 px-4 py-2 text-sm text-signal-copper transition hover:bg-signal-copper/15">
          <Sparkles className="h-4 w-4" />
          AI 分析工作区
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/72 backdrop-blur-md" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[92vh] w-[94vw] max-w-[1500px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[32px] border border-white/10 bg-[#0d1216]/96 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <div className="grid h-full w-full gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="flex h-full flex-col border-r border-white/8 bg-black/18">
              <div className="border-b border-white/8 px-6 pb-5 pt-6">
                <div className="eyebrow">AI Copilot</div>
                <Dialog.Title className="mt-3 font-display text-[36px] leading-none text-white">
                  性能分析工作区
                </Dialog.Title>
                <p className="mt-4 text-sm leading-7 text-signal-fog/68">
                  分析结果会按 `run + 模式` 自动保存在本地。关闭后再次打开，仍可继续查看，不必重跑。
                </p>
              </div>

              <div className="flex-1 overflow-auto px-6 py-5">
                <div className="rounded-[20px] border border-white/8 bg-black/18">
                  <button
                    type="button"
                    onClick={() => setShowConfig(!showConfig)}
                    className="flex w-full items-center justify-between px-4 py-3 text-sm text-signal-fog/70 transition hover:text-white"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] tracking-[0.2em] text-signal-copper/70">模型配置</span>
                      {aiModel ? (
                        <span className="rounded-full bg-signal-copper/10 px-2 py-0.5 text-xs text-signal-copper">
                          {aiModel.trim()}
                        </span>
                      ) : null}
                    </span>
                    {showConfig ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showConfig ? (
                    <div className="space-y-3 border-t border-white/5 px-4 pb-4 pt-3">
                      <div>
                        <label className="mb-1 block text-xs text-signal-fog/50">Base URL</label>
                        <input
                          type="text"
                          value={aiBaseUrl}
                          onChange={(e) => {
                            setAiBaseUrl(e.target.value);
                            resetTestResult();
                          }}
                          placeholder="https://api.openai.com/v1"
                          className="field !rounded-xl !px-3 !py-2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-signal-fog/50">API Key</label>
                        <input
                          type="password"
                          value={aiApiKey}
                          onChange={(e) => {
                            setAiApiKey(e.target.value);
                            resetTestResult();
                          }}
                          placeholder="sk-..."
                          className="field !rounded-xl !px-3 !py-2"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-signal-fog/50">模型名称</label>
                        <input
                          type="text"
                          value={aiModel}
                          onChange={(e) => {
                            setAiModel(e.target.value);
                            resetTestResult();
                          }}
                          placeholder="gpt-4o-mini"
                          className="field !rounded-xl !px-3 !py-2"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleTestConnection()}
                        disabled={testing}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-signal-copper/35 bg-signal-copper/10 px-4 py-2.5 text-sm text-signal-copper transition hover:bg-signal-copper/15 disabled:opacity-50"
                      >
                        {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {testing ? "测试中..." : "测试连接"}
                      </button>
                      {testResult ? (
                        <div
                          className={`rounded-[16px] border px-4 py-3 text-sm leading-6 ${
                            testResult.ok
                              ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                              : "border-signal-ember/25 bg-signal-ember/10 text-signal-ember"
                          }`}
                        >
                          <div>{testResult.message}</div>
                          {testResult.endpoint ? <div className="mt-1 text-xs opacity-80">Endpoint: {testResult.endpoint}</div> : null}
                          {typeof testResult.latencyMs === "number" ? <div className="mt-1 text-xs opacity-80">耗时: {testResult.latencyMs} ms</div> : null}
                          {testResult.responsePreview ? <div className="mt-1 text-xs opacity-80">返回预览: {testResult.responsePreview}</div> : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5">
                  <div className="mb-3 font-mono text-[11px] tracking-[0.22em] text-signal-copper/76">分析模式</div>
                  <div className="space-y-2">
                    {modes.map((item) => {
                      const cached = analysisCache[item.value];
                      return (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setMode(item.value)}
                          className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${
                            mode === item.value
                              ? "border-signal-copper/30 bg-signal-copper/10"
                              : "border-white/8 bg-white/[0.03] hover:border-white/14 hover:bg-white/[0.045]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-white">{item.label}</div>
                            {cached?.content ? (
                              <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-signal-fog/60">
                                已缓存
                              </span>
                            ) : null}
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
                    value={question}
                    onChange={(event) => {
                      const next = event.target.value;
                      setQuestion(next);
                      if (analysisCache[mode]?.content) {
                        persistSnapshot(mode, analysisCache[mode].content, next);
                      }
                    }}
                    className="field min-h-32 !rounded-[22px]"
                    placeholder={mode === "failure" ? "可选：补充你最想确认的失败原因或排查方向。" : "可选：补充你这轮最想让 AI 回答的问题。"}
                  />
                </div>
              </div>

              <div className="border-t border-white/8 px-6 py-5">
                <button
                  type="button"
                  onClick={() => void handleAnalyze(mode)}
                  disabled={loading || testing}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-signal-copper/35 bg-signal-copper/10 px-5 py-3 text-sm text-signal-copper transition hover:bg-signal-copper/15 disabled:opacity-50"
                >
                  {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "分析中..." : `开始${activeMode.label}`}
                </button>
              </div>
            </aside>

            <section className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)),rgba(6,9,12,0.35)]">
              <div className="flex items-start justify-between border-b border-white/8 px-6 pb-5 pt-6">
                <div>
                  <div className="eyebrow">Analysis Output</div>
                  <div className="mt-3 text-[28px] font-medium leading-tight text-white">{activeMode.label}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-signal-fog/58">
                    <span>{mode === "failure" ? "失败诊断会自动读取 runtime、事件流和原始日志片段" : "结果区域已放大为主要工作区"}</span>
                    {lastUpdated ? <span>最近保存于 {formatTimestamp(lastUpdated)}</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-xs text-signal-fog/65">
                    {loading ? "流式生成中" : renderedContent ? "已生成" : "等待生成"}
                  </div>
                  <Dialog.Close asChild>
                    <button className="rounded-full border border-white/10 p-2 text-signal-fog/70 transition hover:border-white/20 hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
                {error ? (
                  <div className="rounded-[20px] border border-signal-ember/25 bg-signal-ember/10 px-5 py-5 text-sm leading-7 text-signal-ember">
                    {error}
                  </div>
                ) : loading && !renderedContent ? (
                  <div className="space-y-5">
                    <div className="h-5 w-32 rounded-full bg-white/8" />
                    <div className="h-12 rounded-[22px] bg-white/[0.045]" />
                    <div className="h-12 rounded-[22px] bg-white/[0.03]" />
                    <div className="h-12 w-4/5 rounded-[22px] bg-white/[0.04]" />
                    <div className="h-32 rounded-[24px] bg-white/[0.025]" />
                  </div>
                ) : renderedContent ? (
                  <div className="mx-auto max-w-5xl rounded-[28px] border border-white/8 bg-black/16 px-7 py-7">
                    <div className="ai-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => <h1>{children}</h1>,
                          h2: ({ children }) => <h2>{children}</h2>,
                          h3: ({ children }) => <h3>{children}</h3>,
                          p: ({ children }) => <p>{children}</p>,
                          ul: ({ children }) => <ul>{children}</ul>,
                          ol: ({ children }) => <ol>{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          strong: ({ children }) => <strong>{children}</strong>,
                          em: ({ children }) => <em>{children}</em>,
                          code: ({ children }) => <code>{children}</code>,
                          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                          hr: () => <hr />,
                        }}
                      >
                        {renderedContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-8 text-center text-sm leading-8 text-signal-fog/50">
                    {mode === "failure"
                      ? "这里会保留当前 run 的失败诊断结果。分析时会自动读取 runtime、事件流和原始日志片段，不需要手动粘贴错误信息。"
                      : "这里会保留当前 run 的 AI 分析结果。即使误关窗口，再次打开也能继续看，不需要重新生成。"}
                  </div>
                )}
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default AIAnalysisPanel;
