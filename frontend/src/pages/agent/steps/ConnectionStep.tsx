import { SectionCard } from "../../../components/SectionCard";
import { Field } from "../../../components/form/Field";

export function ConnectionStep({
  model,
  url,
  apiKey,
  onChange,
}: {
  model: string;
  url: string;
  apiKey: string;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <SectionCard title="服务连接" kicker="Step 02">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="模型名称" required>
          <input
            value={model}
            onChange={(e) => onChange("model", e.target.value)}
            className="field"
            placeholder="Qwen-32B / GLM-4.5-Air"
          />
        </Field>
        <Field label="API 地址" required>
          <input
            value={url}
            onChange={(e) => onChange("url", e.target.value)}
            className="field"
            placeholder="https://host/v1"
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="API Key" hint="可选">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onChange("apiKey", e.target.value)}
            className="field"
            placeholder="sk-..."
          />
        </Field>
      </div>
    </SectionCard>
  );
}
