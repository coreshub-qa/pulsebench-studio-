import { AlertTriangle, ArrowRight, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CommandPreview } from "../components/CommandPreview";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import { loadServiceConfig, saveServiceConfig } from "../lib/storage";
import type { ConfigMeta, RunSpec } from "../lib/types";
import { buildCommandPreview, parseNumberList } from "../lib/utils";

const emptySpec: RunSpec = {
  title: "",
  model: "",
  url: "",
  apiKey: "",
  parallel: [1, 10],
  number: [10, 20],
  dataset: "random",
  tokenizerPath: "",
  datasetPath: "",
  minPromptLength: 1024,
  maxPromptLength: 1024,
  minTokens: 1024,
  maxTokens: 1024,
  extraArgs: {},
  aiEnabled: true,
};

export function LaunchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [meta, setMeta] = useState<ConfigMeta | null>(null);
  const [spec, setSpec] = useState<RunSpec>(() => {
    const saved = loadServiceConfig();
    return { ...emptySpec, ...saved };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Debounced save: persist service connection fields when they change
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveServiceConfig({
        model: spec.model,
        url: spec.url,
        apiKey: spec.apiKey ?? "",
        tokenizerPath: spec.tokenizerPath ?? "",
        datasetPath: spec.datasetPath ?? "",
      });
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [spec.model, spec.url, spec.apiKey, spec.tokenizerPath, spec.datasetPath]);

  useEffect(() => {
    void api.getConfigMeta().then((payload) => {
      setMeta(payload);
      const prefilling = (location.state as { prefill?: Partial<RunSpec> } | null)?.prefill;
      setSpec((current) => ({
        ...payload.defaults,
        ...current,
        ...prefilling,
      }));
    });
  }, [location.state]);

  const requiresTokenizer = meta?.rules[spec.dataset]?.requires?.includes("tokenizerPath");
  const requiresDataset = meta?.rules[spec.dataset]?.requires?.includes("datasetPath");
  const datasetRule = meta?.rules[spec.dataset];

  const validation = useMemo(() => {
    if (!spec.model || !spec.url) return "模型名称与 API 地址为必填项。";
    if (spec.parallel.length !== spec.number.length) return "并发数与请求数长度必须一致。";
    if (requiresTokenizer && !spec.tokenizerPath) return "当前数据集模式必须提供 tokenizer 路径。";
    if (requiresDataset && !spec.datasetPath) return "当前数据集模式必须提供 dataset 路径。";
    if (spec.dataset === "openqa" && (spec.minPromptLength ?? 0) >= 512) {
      return "OpenQA 数据集本身很短，最小 Prompt 长度过高会把样本全部过滤掉。";
    }
    if (spec.dataset === "longalpaca" && (spec.maxPromptLength ?? 0) > 0 && (spec.maxPromptLength ?? 0) < 2048) {
      return "LongAlpaca 是长上下文数据集，最大 Prompt 长度过低时很容易筛空样本。";
    }
    return null;
  }, [requiresDataset, requiresTokenizer, spec]);

  function handleDatasetChange(dataset: string) {
    const nextRule = meta?.rules[dataset];
    const recommendedRange = nextRule?.recommendedPromptRange;
    setSpec((current) => ({
      ...current,
      dataset,
      minPromptLength: recommendedRange?.min ?? current.minPromptLength,
      maxPromptLength: recommendedRange?.max ?? current.maxPromptLength,
    }));
    setError(null);
  }

  async function handleSubmit() {
    if (validation) {
      setError(validation);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const manifest = await api.createRun(spec);
      navigate(`/live/${manifest.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "启动任务失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Main form column — visual center */}
      <div className="space-y-5">
        {/* Section 01: Connection — required fields */}
        <SectionCard title="基础连接" kicker="01 必填信息">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="实验标题">
              <input value={spec.title} onChange={(e) => setSpec({ ...spec, title: e.target.value })} className="field" placeholder="例如：DeepSeek-R1 1024 token 压测" />
            </Field>
            <Field label="模型名称" required>
              <input value={spec.model} onChange={(e) => setSpec({ ...spec, model: e.target.value })} className="field" placeholder="DeepSeek-R1-Distill-Qwen-1.5B" />
              {!spec.model ? <div className="text-xs text-signal-copper/70 mt-1">必填</div> : null}
            </Field>
            <Field label="API 地址" required>
              <input value={spec.url} onChange={(e) => setSpec({ ...spec, url: e.target.value })} className="field" placeholder="https://host/v1" />
              {!spec.url ? <div className="text-xs text-signal-copper/70 mt-1">必填</div> : null}
            </Field>
            <Field label="API Key">
              <input type="password" value={spec.apiKey} onChange={(e) => setSpec({ ...spec, apiKey: e.target.value })} className="field" placeholder="sk-..." />
            </Field>
          </div>
        </SectionCard>

        {/* Section 02: Load & Dataset */}
        <SectionCard title="负载与数据集" kicker="02 实验矩阵">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="并发数列表" hint="支持逗号分隔，例如 1,10,20">
              <input value={spec.parallel.join(", ")} onChange={(e) => setSpec({ ...spec, parallel: parseNumberList(e.target.value) })} className="field" placeholder="1, 10, 20" />
              {spec.parallel.length !== spec.number.length ? <div className="text-xs text-signal-copper/70 mt-1">长度需与请求数一致</div> : null}
            </Field>
            <Field label="请求数列表" hint="长度必须与并发数一致">
              <input value={spec.number.join(", ")} onChange={(e) => setSpec({ ...spec, number: parseNumberList(e.target.value) })} className="field" placeholder="10, 20, 30" />
            </Field>
            <Field label="数据集模式">
              <select value={spec.dataset} onChange={(e) => handleDatasetChange(e.target.value)} className="field">
                {meta?.datasets.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            {requiresTokenizer ? (
              <Field label="Tokenizer 路径" hint="当前模式必填" required>
                <input value={spec.tokenizerPath} onChange={(e) => setSpec({ ...spec, tokenizerPath: e.target.value })} className="field" placeholder="/models/Qwen-1.5B" />
              </Field>
            ) : null}
            {requiresDataset ? (
              <Field label="Dataset 路径" hint="当前模式必填" required>
                <input value={spec.datasetPath} onChange={(e) => setSpec({ ...spec, datasetPath: e.target.value })} className="field" placeholder="/datasets/prompts.txt" />
              </Field>
            ) : null}
          </div>

          {datasetRule?.tip ? (
            <div className="mt-4 rounded-[18px] border border-signal-copper/18 bg-signal-copper/6 px-4 py-3 text-xs leading-6 text-signal-fog/70">
              {datasetRule.tip}
            </div>
          ) : null}
        </SectionCard>

        {/* Section 03: Advanced — collapsible */}
        <div className="rounded-[28px] border border-white/6 bg-white/[0.015]">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]"
          >
            <div className="eyebrow flex-1">03 约束条件与高级选项</div>
            <ChevronDown className={`h-4 w-4 text-signal-fog/40 transition ${showAdvanced ? "rotate-180" : ""}`} />
          </button>

          {showAdvanced ? (
            <div className="border-t border-white/6 px-5 pb-5 pt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Field label="最小 Prompt 长度">
                  <input type="number" value={spec.minPromptLength ?? ""} onChange={(e) => setSpec({ ...spec, minPromptLength: Number(e.target.value) })} className="field" />
                </Field>
                <Field label="最大 Prompt 长度">
                  <input type="number" value={spec.maxPromptLength ?? ""} onChange={(e) => setSpec({ ...spec, maxPromptLength: Number(e.target.value) })} className="field" />
                </Field>
                <Field label="最小输出 Token">
                  <input type="number" value={spec.minTokens ?? ""} onChange={(e) => setSpec({ ...spec, minTokens: Number(e.target.value) })} className="field" />
                </Field>
                <Field label="最大输出 Token">
                  <input type="number" value={spec.maxTokens ?? ""} onChange={(e) => setSpec({ ...spec, maxTokens: Number(e.target.value) })} className="field" />
                </Field>
              </div>

              <div className="mt-4 rounded-[18px] border border-white/8 bg-black/14 px-4 py-3">
                <label className="flex items-center gap-3 text-sm text-signal-fog/75">
                  <input
                    type="checkbox"
                    checked={spec.aiEnabled}
                    onChange={(event) => setSpec({ ...spec, aiEnabled: event.target.checked })}
                    className="h-4 w-4 accent-[#c89a5b]"
                  />
                  完成后启用 AI 分析入口
                </label>
              </div>

              <div className="mt-4 rounded-[18px] border border-white/6 bg-white/[0.015] px-4 py-3 text-xs leading-6 text-signal-fog/50">
                页面里填写的是容器内路径。建议模型挂载到 <code className="text-signal-fog/70">/models</code>，数据集挂载到 <code className="text-signal-fog/70">/datasets</code>。
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Sidebar — compact status + CTA only */}
      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <SectionCard title="启动摘要" kicker="Launch" compact>
          <div className="space-y-2">
            <MiniMetric title="数据集" value={spec.dataset} />
            <MiniMetric title="并发组数" value={`${spec.parallel.length}`} />
            <MiniMetric title="AI 分析" value={spec.aiEnabled ? "开启" : "关闭"} />
          </div>

          {/* Validation — inline, right next to CTA */}
          {validation ? (
            <div className="mt-4 flex items-start gap-2 rounded-[16px] border border-signal-copper/20 bg-signal-copper/8 px-3 py-2.5 text-xs leading-6 text-signal-copper">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{validation}</span>
            </div>
          ) : (
            <div className="mt-4 text-xs leading-6 text-signal-fog/50">
              配置就绪，可以启动。
            </div>
          )}

          {error ? <div className="mt-3 rounded-xl border border-signal-ember/30 bg-signal-ember/10 px-3 py-2 text-xs text-signal-ember">{error}</div> : null}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-3.5 text-sm font-medium text-signal-copper transition hover:bg-signal-copper/16 disabled:opacity-50"
          >
            {loading ? "启动中..." : "开始测试"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </SectionCard>

        <CommandPreview value={buildCommandPreview(spec)} />
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
