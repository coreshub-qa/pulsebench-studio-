import { SectionCard } from "../../../components/SectionCard";
import { Field } from "../../../components/form/Field";

function SignalGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 text-sm font-medium text-white/92">{title}</div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

export function SignalsStep({
  form,
  onChange,
}: {
  form: {
    parameterScale: string;
    contextWindow: string;
    gpuModel: string;
    gpuCount: string;
    gpuMemoryGb: string;
    engine: string;
    quantization: string;
    tokenizerPath: string;
    typicalPromptLength: string;
    typicalOutputLength: string;
    stream: boolean;
  };
  onChange: (field: string, value: string | boolean) => void;
}) {
  return (
    <SectionCard title="环境信号" kicker="Step 03">
      <p className="mb-5 text-sm text-signal-fog/52">
        信号越完整，Agent 给出的并发梯度、长度边界和风险提示越可靠。全部为可选字段。
      </p>
      <div className="space-y-5">
        <SignalGroup title="硬件信息">
          <Field label="参数量">
            <input value={form.parameterScale} onChange={(e) => onChange("parameterScale", e.target.value)} className="field" placeholder="例如 7B / 32B / 72B" />
          </Field>
          <Field label="上下文窗口">
            <input value={form.contextWindow} onChange={(e) => onChange("contextWindow", e.target.value)} className="field" placeholder="例如 32768 / 131072" />
          </Field>
          <Field label="GPU 型号">
            <input value={form.gpuModel} onChange={(e) => onChange("gpuModel", e.target.value)} className="field" placeholder="H100 / A100 / 4090" />
          </Field>
          <Field label="GPU 数量">
            <input value={form.gpuCount} onChange={(e) => onChange("gpuCount", e.target.value)} className="field" placeholder="1 / 4 / 8" />
          </Field>
          <Field label="单卡显存 (GB)">
            <input value={form.gpuMemoryGb} onChange={(e) => onChange("gpuMemoryGb", e.target.value)} className="field" placeholder="24 / 48 / 80" />
          </Field>
        </SignalGroup>

        <SignalGroup title="引擎配置">
          <Field label="推理引擎">
            <input value={form.engine} onChange={(e) => onChange("engine", e.target.value)} className="field" placeholder="vLLM / SGLang / TGI" />
          </Field>
          <Field label="量化方式">
            <input value={form.quantization} onChange={(e) => onChange("quantization", e.target.value)} className="field" placeholder="bf16 / int4 / awq / fp8" />
          </Field>
          <Field label="Tokenizer 路径">
            <input value={form.tokenizerPath} onChange={(e) => onChange("tokenizerPath", e.target.value)} className="field" placeholder="/models/Qwen-32B" />
          </Field>
        </SignalGroup>

        <SignalGroup title="负载画像">
          <Field label="典型输入长度">
            <input value={form.typicalPromptLength} onChange={(e) => onChange("typicalPromptLength", e.target.value)} className="field" placeholder="例如 2048 / 8192 / 32768" />
          </Field>
          <Field label="典型输出长度">
            <input value={form.typicalOutputLength} onChange={(e) => onChange("typicalOutputLength", e.target.value)} className="field" placeholder="例如 1024 / 4096" />
          </Field>
          <label className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.02] px-4 py-3 text-sm text-signal-fog/75">
            <input
              type="checkbox"
              checked={form.stream}
              onChange={(e) => onChange("stream", e.target.checked)}
              className="h-4 w-4 accent-[#c89a5b]"
            />
            目标服务默认按流式返回假设规划
          </label>
        </SignalGroup>
      </div>
    </SectionCard>
  );
}
