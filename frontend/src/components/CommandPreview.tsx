import { Copy } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "./SectionCard";

export function CommandPreview({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <SectionCard title="命令镜像" kicker="CLI Projection" className="h-full">
      <div className="rounded-[24px] border border-white/8 bg-black/22 p-4">
        <pre className="overflow-auto whitespace-pre-wrap break-all font-mono text-sm leading-6 text-signal-fog/85">{value}</pre>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-signal-fog transition hover:border-signal-copper/40 hover:text-signal-copper"
        >
          <Copy className="h-4 w-4" />
          {copied ? "已复制" : "复制命令"}
        </button>
      </div>
    </SectionCard>
  );
}
