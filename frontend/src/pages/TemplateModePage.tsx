import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import { loadServiceConfig, saveServiceConfig } from "../lib/storage";
import type { BatchRunConfig, RunSpec, ScenarioTemplate, TemplateMatrixItem } from "../lib/types";
import { parseNumberList } from "../lib/utils";

type BuilderMode = "quick_check" | "template";

type BaseFields = {
  title: string;
  model: string;
  url: string;
  apiKey: string;
  tokenizerPath: string;
};

export function TemplateModePage({ mode }: { mode: BuilderMode }) {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>(templateId ?? (mode === "quick_check" ? "quick_check" : ""));
  const [base, setBase] = useState<BaseFields>(() => {
    const saved = loadServiceConfig();
    return {
      title: "",
      model: saved.model,
      url: saved.url,
      apiKey: saved.apiKey,
      tokenizerPath: saved.tokenizerPath,
    };
  });
  const [matrix, setMatrix] = useState<TemplateMatrixItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  // Debounced save: persist service connection fields when they change
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveServiceConfig({
        model: base.model,
        url: base.url,
        apiKey: base.apiKey,
        tokenizerPath: base.tokenizerPath,
        datasetPath: "",
      });
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [base.model, base.url, base.apiKey, base.tokenizerPath]);

  useEffect(() => {
    void api.getTemplates().then((templatePayload) => {
      const filtered = templatePayload.filter((item) => item.mode === mode);
      setTemplates(filtered);
      const initial = filtered.find((item) => item.id === (templateId ?? selectedId)) ?? filtered[0];
      if (initial) {
        setSelectedId(initial.id);
        setMatrix(JSON.parse(JSON.stringify(initial.matrix)) as TemplateMatrixItem[]);
      }
    });
  }, [mode, templateId]);

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? null,
    [selectedId, templates],
  );

  useEffect(() => {
    if (!selected) return;
    setMatrix(JSON.parse(JSON.stringify(selected.matrix)) as TemplateMatrixItem[]);
    setBase((current) => ({
      ...current,
      title: current.title || (mode === "quick_check" ? "一键体检批次" : `${selected.name} 批次`),
    }));
  }, [mode, selected]);

  const validation = useMemo(() => {
    if (!selected) return "请选择模板。";
    if (!base.model || !base.url) return "模型名称与 API 地址为必填项。";
    if (selected.requiresTokenizerPath && !base.tokenizerPath) return "当前模板需要 tokenizer 路径。";
    for (const item of matrix) {
      if (item.parallel.length !== item.number.length) {
        return `矩阵项「${item.label}」的并发与请求数长度不一致。`;
      }
    }
    return null;
  }, [base.model, base.tokenizerPath, base.url, matrix, selected]);

  const runCount = useMemo(() => matrix.length, [matrix.length]);
  const totalRequests = useMemo(
    () => matrix.reduce((sum, item) => sum + item.number.reduce((sub, current) => sub + current, 0), 0),
    [matrix],
  );

  function handleSelect(nextId: string) {
    const next = templates.find((item) => item.id === nextId);
    setSelectedId(nextId);
    if (next) {
      setMatrix(JSON.parse(JSON.stringify(next.matrix)) as TemplateMatrixItem[]);
      setError(null);
    }
  }

  function updateMatrix(index: number, changes: Partial<TemplateMatrixItem>) {
    setMatrix((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));
  }

  function buildRuns(): BatchRunConfig[] {
    if (!selected) return [];
    return matrix.map((item, index) => {
      const spec: RunSpec = {
        title: `${base.title || selected.name} · ${item.label}`,
        model: base.model,
        url: base.url,
        apiKey: base.apiKey,
        parallel: item.parallel,
        number: item.number,
        dataset: item.dataset || selected.dataset,
        datasetPath: item.datasetPath || "",
        tokenizerPath: selected.requiresTokenizerPath ? base.tokenizerPath : "",
        minPromptLength: item.minPromptLength,
        maxPromptLength: item.maxPromptLength,
        minTokens: item.minTokens,
        maxTokens: item.maxTokens,
        extraArgs: {},
        aiEnabled: true,
      };
      return {
        label: item.label || `${selected.name}-${index + 1}`,
        objective: item.objective,
        spec,
      };
    });
  }

  async function handleLaunch() {
    if (validation || !selected) {
      setError(validation);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const batch = await api.createBatch({
        templateId: selected.id,
        mode,
        title: base.title || selected.name,
        runs: buildRuns(),
      });
      navigate(`/batch/${batch.batchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动批次失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Main form column */}
      <div className="space-y-5">
        {/* Step 1 (template mode only): Template selection as a decision step */}
        {mode === "template" ? (
          <SectionCard title="选择模板" kicker="01 模板入口">
            <div className="grid gap-3 lg:grid-cols-2">
              {templates.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`rounded-[22px] border p-4 text-left transition ${
                      active
                        ? "border-signal-copper/30 bg-white/[0.045]"
                        : "border-white/8 bg-white/[0.015] hover:border-white/14 hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-base font-medium text-white">{item.name}</div>
                      {active ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-signal-copper" /> : null}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-signal-fog/60">{item.description}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.focusMetrics.slice(0, 3).map((metric) => (
                        <span key={metric} className="rounded-full border border-white/8 px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-signal-fog/50">
                          {metric}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </SectionCard>
        ) : null}

        {/* Connection fields */}
        <SectionCard title="基础连接" kicker={mode === "quick_check" ? "01 必填信息" : "02 必填信息"}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="批次标题">
              <input
                value={base.title}
                onChange={(e) => setBase({ ...base, title: e.target.value })}
                className="field"
                placeholder={mode === "quick_check" ? "例如：GLM-5.1 一键体检" : "例如：GLM-5.1 长上下文模板"}
              />
            </Field>
            <Field label="模型名称" required>
              <input value={base.model} onChange={(e) => setBase({ ...base, model: e.target.value })} className="field" placeholder="GLM-5.1" />
              {!base.model ? <div className="text-xs text-signal-copper/70 mt-1">必填</div> : null}
            </Field>
            <Field label="API 地址" required>
              <input value={base.url} onChange={(e) => setBase({ ...base, url: e.target.value })} className="field" placeholder="https://host/v1" />
              {!base.url ? <div className="text-xs text-signal-copper/70 mt-1">必填</div> : null}
            </Field>
            <Field label="API Key">
              <input type="password" value={base.apiKey} onChange={(e) => setBase({ ...base, apiKey: e.target.value })} className="field" placeholder="sk-..." />
            </Field>
            {selected?.requiresTokenizerPath ? (
              <Field label="Tokenizer 路径" required hint="当前模板需要">
                <input value={base.tokenizerPath} onChange={(e) => setBase({ ...base, tokenizerPath: e.target.value })} className="field" placeholder="/models/xxx" />
              </Field>
            ) : null}
          </div>
        </SectionCard>

        {/* Matrix — collapsible per item */}
        <SectionCard title="运行矩阵" kicker={mode === "quick_check" ? "02 运行矩阵" : "03 运行矩阵"}>
          <div className="space-y-3">
            {matrix.map((item, index) => {
              const isExpanded = expandedRun === index;
              return (
                <div
                  key={`${item.label}-${index}`}
                  className="rounded-[20px] border border-white/6 bg-white/[0.015] overflow-hidden"
                >
                  {/* Collapsed summary row */}
                  <button
                    type="button"
                    onClick={() => setExpandedRun(isExpanded ? null : index)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
                  >
                    <span className="rounded-full border border-signal-copper/20 bg-signal-copper/8 px-2 py-0.5 font-mono text-[10px] tracking-[0.16em] text-signal-copper">
                      Run {index + 1}
                    </span>
                    <span className="text-sm font-medium text-white">{item.label}</span>
                    <span className="text-xs text-signal-fog/45 truncate flex-1">{item.objective}</span>
                    <div className="flex items-center gap-2 text-xs text-signal-fog/40">
                      <span>{item.dataset || selected?.dataset}</span>
                      <span>C:{item.parallel.join("/")}</span>
                      <span>R:{item.number.join("/")}</span>
                    </div>
                    <ChevronDown className={`h-3.5 w-3.5 text-signal-fog/35 transition ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {/* Expanded edit form */}
                  {isExpanded ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="border-t border-white/6 px-4 pb-4 pt-3"
                    >
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <Field label="标签">
                          <input value={item.label} onChange={(e) => updateMatrix(index, { label: e.target.value })} className="field" />
                        </Field>
                        <Field label="目标说明">
                          <input value={item.objective} onChange={(e) => updateMatrix(index, { objective: e.target.value })} className="field" />
                        </Field>
                        <Field label="数据集">
                          <select value={item.dataset || selected?.dataset || "random"} onChange={(e) => updateMatrix(index, { dataset: e.target.value })} className="field">
                            <option value="random">random</option>
                            <option value="openqa">openqa</option>
                            <option value="longalpaca">longalpaca</option>
                            <option value="line_by_line">line_by_line</option>
                          </select>
                        </Field>
                        <Field label="最小输入长度">
                          <input type="number" value={item.minPromptLength} onChange={(e) => updateMatrix(index, { minPromptLength: Number(e.target.value) })} className="field" />
                        </Field>
                        <Field label="最大输入长度">
                          <input type="number" value={item.maxPromptLength} onChange={(e) => updateMatrix(index, { maxPromptLength: Number(e.target.value) })} className="field" />
                        </Field>
                        <Field label="最小输出长度">
                          <input type="number" value={item.minTokens} onChange={(e) => updateMatrix(index, { minTokens: Number(e.target.value) })} className="field" />
                        </Field>
                        <Field label="最大输出长度">
                          <input type="number" value={item.maxTokens} onChange={(e) => updateMatrix(index, { maxTokens: Number(e.target.value) })} className="field" />
                        </Field>
                        <Field label="并发数列表">
                          <input value={item.parallel.join(", ")} onChange={(e) => updateMatrix(index, { parallel: parseNumberList(e.target.value) })} className="field" />
                        </Field>
                        <Field label="请求数列表">
                          <input value={item.number.join(", ")} onChange={(e) => updateMatrix(index, { number: parseNumberList(e.target.value) })} className="field" />
                        </Field>
                      </div>
                    </motion.div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      {/* Sidebar — compact status + CTA */}
      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <SectionCard title="批次摘要" kicker="Launch" compact>
          <div className="space-y-2">
            <MiniMetric title="模板" value={selected?.name ?? "--"} />
            <MiniMetric title="矩阵项" value={`${runCount}`} />
            <MiniMetric title="总请求" value={`${totalRequests}`} />
          </div>

          {selected ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selected.focusMetrics.map((item) => (
                <span key={item} className="rounded-full border border-white/8 px-2 py-1 font-mono text-[10px] tracking-[0.16em] text-signal-fog/50">
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {validation ? (
            <div className="mt-4 flex items-start gap-2 rounded-[16px] border border-signal-copper/20 bg-signal-copper/8 px-3 py-2.5 text-xs leading-6 text-signal-copper">
              <span>{validation}</span>
            </div>
          ) : (
            <div className="mt-4 text-xs leading-6 text-signal-fog/50">
              配置就绪，可以启动批次。
            </div>
          )}

          {error ? <div className="mt-3 rounded-xl border border-signal-ember/30 bg-signal-ember/10 px-3 py-2 text-xs text-signal-ember">{error}</div> : null}

          <button
            type="button"
            onClick={() => void handleLaunch()}
            disabled={loading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-3.5 text-sm font-medium text-signal-copper transition hover:bg-signal-copper/16 disabled:opacity-50"
          >
            {loading ? "批次启动中..." : "启动批次"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </SectionCard>
      </div>
    </div>
  );
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
    <label className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.18em] text-signal-fog/58">{label}</span>
        {required ? <span className="font-mono text-[11px] tracking-[0.16em] text-signal-copper">必填</span> : null}
      </div>
      {children}
      {hint ? <div className="text-xs leading-6 text-signal-fog/45">{hint}</div> : null}
    </label>
  );
}
