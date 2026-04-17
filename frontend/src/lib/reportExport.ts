import type { AIAnalysisSnapshot } from "./storage";
import type { RunDetails, RunReport } from "./types";
import { formatDate, formatNumber } from "./utils";

export type ReportChartSnapshots = {
  tradeoff?: string;
  percentile?: string;
};

export type ExportableAIAnalysis = Record<string, AIAnalysisSnapshot>;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function exportReportHtml({
  runId,
  report,
  details,
  chartSnapshots,
  aiAnalyses,
}: {
  runId: string;
  report: RunReport;
  details?: RunDetails | null;
  chartSnapshots?: ReportChartSnapshots;
  aiAnalyses?: ExportableAIAnalysis;
}) {
  const overview = report.overview;
  const metadata = [
    ["模型", String(overview.model ?? details?.spec.model ?? "--")],
    ["状态", String(overview.status ?? details?.runtime.status ?? "--")],
    ["数据集", String(overview.dataset ?? details?.spec.dataset ?? "--")],
    ["运行 ID", runId],
    ["创建时间", details?.runtime.createdAt ? formatDate(details.runtime.createdAt) : "--"],
  ];

  const summaryFacts = [
    ["总请求", formatNumber(Number(overview.totalRequests ?? 0))],
    ["当前 RPS", formatNumber(Number(overview.summaryRequestThroughput ?? overview.bestRps ?? 0))],
    ["当前延迟", `${formatNumber(Number(overview.summaryAvgLatencySec ?? overview.bestLatencySec ?? 0))} sec`],
    ["当前 TTFT", `${formatNumber(Number(overview.summaryAvgTtftSec ?? 0))} sec`],
    ["输出吞吐", `${formatNumber(Number(overview.summaryOutputTokensPerSec ?? 0))} tok/s`],
    ["成功率", `${formatNumber(Number(overview.summarySuccessRate ?? 0))} %`],
  ];

  const diagnosisItems = report.diagnosis
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  const rawSummary = escapeHtml(report.rawSummaryText || details?.commandPreview || "暂无原始摘要");
  const aiModeLabels: Record<string, string> = {
    overview: "整体诊断",
    bottleneck: "瓶颈判断",
    next_step: "下一轮建议",
    failure: "失败诊断",
  };
  const aiSections = Object.entries(aiAnalyses ?? {})
    .filter(([, snapshot]) => snapshot?.content?.trim())
    .map(([mode, snapshot]) => `
      <section class="panel">
        <div class="eyebrow">AI Diagnosis</div>
        <h2>${escapeHtml(aiModeLabels[mode] ?? mode)}</h2>
        ${snapshot.updatedAt ? `<div class="sub" style="margin-bottom: 14px;">最近生成：${escapeHtml(formatDate(snapshot.updatedAt))}</div>` : ""}
        ${snapshot.question ? `<div class="sub" style="margin-bottom: 14px;">附加问题：${escapeHtml(snapshot.question)}</div>` : ""}
        <pre>${escapeHtml(snapshot.content)}</pre>
      </section>
    `)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PulseBench Report ${escapeHtml(runId)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1014;
      --panel: #121920;
      --border: rgba(255,255,255,0.08);
      --text: #ebf1ee;
      --muted: #94a6a0;
      --cyan: #6bf7da;
      --copper: #d68b42;
      --ember: #ff6f3d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      background: radial-gradient(circle at top, rgba(107,247,218,0.06), transparent 28%), var(--bg);
      color: var(--text);
      font-family: "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .wrap { max-width: 1280px; margin: 0 auto; }
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .eyebrow {
      color: var(--cyan);
      font-size: 12px;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    h1, h2 { margin: 0; }
    h1 { font-size: 42px; margin-bottom: 10px; }
    h2 { font-size: 26px; margin-bottom: 18px; }
    .sub { color: var(--muted); line-height: 1.8; }
    .grid { display: grid; gap: 16px; }
    .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pill-wrap { display: flex; flex-wrap: wrap; gap: 10px; }
    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--muted);
      font-size: 14px;
    }
    .metric {
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 16px;
      background: rgba(255,255,255,0.02);
    }
    .metric-label {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .metric-value {
      margin-top: 10px;
      font-size: 34px;
      line-height: 1.1;
      color: white;
    }
    ul { margin: 0; padding-left: 22px; }
    li { margin: 0 0 12px; line-height: 1.8; color: var(--text); }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
      background: rgba(0,0,0,0.18);
      color: var(--muted);
      font-size: 12px;
      line-height: 1.7;
      margin: 0;
    }
    img {
      width: 100%;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(0,0,0,0.18);
      display: block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      color: var(--text);
    }
    td {
      border-bottom: 1px solid var(--border);
      padding: 12px 0;
    }
    td:first-child { color: var(--muted); width: 140px; }
    @media (max-width: 960px) {
      body { padding: 16px; }
      .grid-4, .grid-2 { grid-template-columns: 1fr; }
      h1 { font-size: 32px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel">
      <div class="eyebrow">PulseBench Report Export</div>
      <h1>${escapeHtml(String(overview.model ?? details?.spec.model ?? "Run Report"))}</h1>
      <div class="sub">导出时间：${escapeHtml(formatDate(new Date().toISOString()))}</div>
      <div class="pill-wrap" style="margin-top: 18px;">
        ${metadata.map(([label, value]) => `<div class="pill">${escapeHtml(label)} · ${escapeHtml(value)}</div>`).join("")}
      </div>
    </section>

    <section class="panel">
      <div class="eyebrow">Summary</div>
      <div class="grid grid-4">
        ${summaryFacts.map(([label, value]) => `
          <div class="metric">
            <div class="metric-label">${escapeHtml(label)}</div>
            <div class="metric-value">${escapeHtml(value)}</div>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="panel">
      <div class="eyebrow">Diagnosis</div>
      <h2>规则诊断摘要</h2>
      <ul>${diagnosisItems}</ul>
    </section>

    <section class="panel">
      <div class="eyebrow">Charts</div>
      <div class="grid grid-2">
        <div>
          <h2>Tradeoff Matrix</h2>
          ${chartSnapshots?.tradeoff ? `<img src="${chartSnapshots.tradeoff}" alt="Tradeoff Matrix" />` : `<div class="sub">图表快照暂不可用</div>`}
        </div>
        <div>
          <h2>Percentile Lens</h2>
          ${chartSnapshots?.percentile ? `<img src="${chartSnapshots.percentile}" alt="Percentile Lens" />` : `<div class="sub">图表快照暂不可用</div>`}
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="eyebrow">Traceability</div>
      <h2>Raw Summary</h2>
      <pre>${rawSummary}</pre>
    </section>

    ${aiSections}
  </div>
</body>
</html>`;

  downloadText(`pulsebench-report-${runId}.html`, html, "text/html;charset=utf-8");
}
