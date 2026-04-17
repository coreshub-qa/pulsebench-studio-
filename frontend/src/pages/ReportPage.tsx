import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, FileDown, ImageDown, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { toPng } from "html-to-image";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import type { ChartsPanelHandle } from "../components/ChartsPanel";
import { api } from "../lib/api";
import { downloadDataUrl, exportReportHtml } from "../lib/reportExport";
import { loadAIAnalysisCache, type AIAnalysisSnapshot } from "../lib/storage";
import type { RunDetails, RunEvent, RunReport, RunStatus } from "../lib/types";
import { formatDate, formatNumber, getStatusTone } from "../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const AIAnalysisPanel = lazy(() => import("../components/AIAnalysisPanel").then((module) => ({ default: module.AIAnalysisPanel })));
const ChartsPanel = lazy(() => import("../components/ChartsPanel").then((module) => ({ default: module.ChartsPanel })));

export function ReportPage() {
  const { runId = "" } = useParams();
  const [report, setReport] = useState<RunReport | null>(null);
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [reportPending, setReportPending] = useState(false);
  const [reportUnavailable, setReportUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"png" | "html" | null>(null);
  const [exportAIAnalyses, setExportAIAnalyses] = useState<Record<string, AIAnalysisSnapshot>>({});
  const exportRef = useRef<HTMLDivElement | null>(null);
  const chartsRef = useRef<ChartsPanelHandle | null>(null);

  useEffect(() => {
    let disposed = false;
    setReport(null);
    setDetails(null);
    setEvents([]);
    setReportPending(false);
    setReportUnavailable(false);
    setError(null);
    setExportError(null);
    setExportAIAnalyses(loadAIAnalysisCache(runId));

    async function load() {
      try {
        const detailsPayload = await api.getRun(runId);
        if (disposed) return;
        setDetails(detailsPayload);

        try {
          const reportPayload = await api.getReport(runId);
          if (disposed) return;
          setReport(reportPayload);
          setReportPending(false);
          setReportUnavailable(false);
          setError(null);
        } catch (err) {
          if (disposed) return;
          const isActive = ["pending", "starting", "running"].includes(detailsPayload.runtime.status);
          if (!detailsPayload.hasReport && isActive) {
            setReport(null);
            setReportPending(true);
            setReportUnavailable(false);
            setError(null);
            return;
          }
          const isFinishedWithoutReport = !detailsPayload.hasReport && ["failed", "stopped"].includes(detailsPayload.runtime.status);
          if (isFinishedWithoutReport) {
            setReport(null);
            setReportPending(false);
            setReportUnavailable(true);
            setError(null);
            return;
          }
          setError(err instanceof Error ? err.message : "报告加载失败");
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : "报告加载失败");
        }
      }
    }

    void load();

    return () => {
      disposed = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!runId || !(reportPending || reportUnavailable)) return;
    const source = new EventSource(`/api/runs/${runId}/events`);

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as RunEvent;
      setEvents((current) => [...current.slice(-199), payload]);
      if (payload.type === "done") {
        void api.getRun(runId).then((nextDetails) => {
          setDetails(nextDetails);
          if (nextDetails.hasReport) {
            void api.getReport(runId)
              .then((nextReport) => {
                setReport(nextReport);
                setReportPending(false);
                setReportUnavailable(false);
                setError(null);
              })
              .catch((err) => setError(err instanceof Error ? err.message : "报告加载失败"));
          } else if (!["pending", "starting", "running"].includes(nextDetails.runtime.status)) {
            setReportPending(false);
            setReportUnavailable(true);
            setError(null);
          }
        }).catch(() => undefined);
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [reportPending, reportUnavailable, runId]);

  if (error) {
    return <div className="rounded-[28px] border border-signal-ember/30 bg-signal-ember/10 p-6 text-signal-ember">{error}</div>;
  }
  if ((reportPending || reportUnavailable) && details) {
    const runtime = details.runtime;
    const isFailedWithoutReport = reportUnavailable && runtime.status === "failed";
    return (
      <div className="space-y-5">
        <SectionCard title={String(details.spec.model || "Run In Progress")} kicker={reportPending ? "Report Pending" : "Failure Trace"}>
          <div className="grid gap-4 lg:grid-cols-[0.84fr_1.16fr]">
            <div className="space-y-4">
              <div className={`inline-flex rounded-full border px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] ${getStatusTone(runtime.status)}`}>
                {runtime.status}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Created" value={formatDate(runtime.createdAt)} accent="copper" />
                <MetricCard label="Phase" value={runtime.phase ?? "--"} />
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Runtime Message</div>
                <div className="mt-3 text-sm leading-7 text-signal-fog/80">
                  {runtime.message || (reportPending ? "任务运行中，报告将在完成后自动生成。" : "任务已结束，但未生成结构化报告。")}
                </div>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Command Preview</div>
                <pre className="mt-3 whitespace-pre-wrap break-all font-mono text-xs leading-6 text-signal-fog/80">{details.commandPreview ?? "--"}</pre>
              </div>
              {isFailedWithoutReport && details.spec.aiEnabled ? (
                <Suspense fallback={<div className="rounded-full border border-white/10 px-4 py-2 text-sm text-signal-fog/65">AI 面板加载中...</div>}>
                  <AIAnalysisPanel runId={runId} runStatus={runtime.status} />
                </Suspense>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <Link
                  to={`/live/${runId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-signal-cyan/35 bg-signal-cyan/10 px-4 py-2 text-sm text-signal-cyan shadow-glow"
                >
                  打开运行页
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-display text-xl uppercase tracking-[0.12em] text-white">Event Rail</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">
                    {reportPending ? "报告尚未生成，先展示实时进度" : "任务已结束，保留完整事件流供失败诊断"}
                  </div>
                </div>
              </div>
              <div className="h-[520px] overflow-auto rounded-[20px] border border-white/10 bg-graphite-950/80 p-4 font-mono text-xs leading-6 text-signal-fog/80">
                {events.length === 0 ? (
                  <div className="text-signal-fog/45">等待事件流...</div>
                ) : (
                  events.map((event, index) => (
                    <div key={`${event.ts}-${index}`} className="border-b border-white/5 py-2 last:border-b-0">
                      <div className="mb-1 flex items-center gap-3">
                        <span className="text-signal-cyan/70">{formatDate(event.ts)}</span>
                        <span className="uppercase tracking-[0.2em] text-signal-copper/80">{event.phase ?? event.type}</span>
                      </div>
                      <div>{event.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    );
  }
  if (!report) {
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-signal-fog/70">报告加载中...</div>;
  }

  const overview = report.overview;
  const fallbackConcurrency = report.perConcurrency.length ? report.perConcurrency[report.perConcurrency.length - 1].concurrency : 0;
  const summaryConcurrency = Number(overview.summaryConcurrency ?? fallbackConcurrency ?? 0);
  const status = String(overview.status ?? details?.runtime.status ?? "--");
  const statusTone = ["pending", "starting", "running", "success", "failed", "stopped"].includes(status)
    ? getStatusTone(status as RunStatus)
    : "border-white/10 text-signal-fog/75";
  const metadataItems = [
    { label: "数据集", value: String(overview.dataset ?? details?.spec.dataset ?? "--") },
    { label: "状态", value: status },
    { label: "当前摘要", value: summaryConcurrency ? `并发 ${summaryConcurrency}` : "--" },
    { label: "运行 ID", value: runId },
  ];
  const summaryFacts = [
    { label: "耗时", value: overview.summaryTimeTakenSec, unit: "sec" },
    { label: "成功请求", value: overview.summarySucceededRequests, unit: "req" },
    { label: "失败请求", value: overview.summaryFailedRequests, unit: "req" },
    { label: "总吞吐", value: overview.summaryTotalTokensPerSec, unit: "tok/s" },
    { label: "TPOT", value: overview.summaryAvgTpotSec, unit: "sec" },
    { label: "ITL", value: overview.summaryAvgItlSec, unit: "sec" },
    { label: "平均输入", value: overview.summaryAvgInputTokensPerRequest, unit: "tok" },
    { label: "平均输出", value: overview.summaryAvgOutputTokensPerRequest, unit: "tok" },
  ];
  const exportFilenameBase = `pulsebench-report-${runId}`;
  const aiModeLabels: Record<string, string> = {
    overview: "整体诊断",
    bottleneck: "瓶颈判断",
    next_step: "下一轮建议",
    failure: "失败诊断",
  };
  const exportableAIEntries = Object.entries(exportAIAnalyses).filter(([, snapshot]) => snapshot?.content?.trim());

  async function syncAIExportContent() {
    setExportAIAnalyses(loadAIAnalysisCache(runId));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function handleExportPng() {
    if (!exportRef.current) return;
    setExportError(null);
    setExporting("png");
    try {
      await syncAIExportContent();
      const dataUrl = await toPng(exportRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#0b1014",
      });
      downloadDataUrl(`${exportFilenameBase}.png`, dataUrl);
    } catch (err) {
      setExportError(err instanceof Error ? `导出 PNG 失败：${err.message}` : "导出 PNG 失败");
    } finally {
      setExporting(null);
    }
  }

  function handleExportHtml() {
    if (!report) return;
    setExportError(null);
    setExporting("html");
    try {
      const latestAIAnalyses = loadAIAnalysisCache(runId);
      setExportAIAnalyses(latestAIAnalyses);
      exportReportHtml({
        runId,
        report,
        details,
        chartSnapshots: chartsRef.current?.captureSnapshots(),
        aiAnalyses: latestAIAnalyses,
      });
    } catch (err) {
      setExportError(err instanceof Error ? `导出 HTML 失败：${err.message}` : "导出 HTML 失败");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-3" data-export-ignore="true">
        <button
          type="button"
          onClick={() => void handleExportPng()}
          disabled={exporting !== null}
          className="inline-flex items-center gap-2 rounded-full border border-signal-copper/30 bg-signal-copper/10 px-4 py-2 text-sm text-signal-copper transition hover:bg-signal-copper/15 disabled:opacity-50"
        >
          {exporting === "png" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          诊断与图表一键导出
        </button>
        <button
          type="button"
          onClick={() => void handleExportPng()}
          disabled={exporting !== null}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-signal-fog/78 transition hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          {exporting === "png" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
          导出 PNG
        </button>
        <button
          type="button"
          onClick={handleExportHtml}
          disabled={exporting !== null}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-signal-fog/78 transition hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          {exporting === "html" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          导出 HTML
        </button>
      </div>

      {exportError ? (
        <div className="rounded-[20px] border border-signal-ember/25 bg-signal-ember/10 px-5 py-4 text-sm text-signal-ember" data-export-ignore="true">
          {exportError}
        </div>
      ) : null}

      <div ref={exportRef} className="space-y-5">
        <SectionCard title={String(overview.model ?? details?.spec.model ?? "Run Report")} kicker="Result Console">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.26em] text-signal-fog/55">PulseBench Report</div>
              <div className="mt-2 max-w-2xl text-sm leading-7 text-signal-fog/72">
                先看系统在不同并发下的吞吐与延迟权衡，再根据尾延迟和输出阶段指标判断下一步扩容还是继续探底。
              </div>
            </div>
            <div data-export-ignore="true">
              {details?.spec.aiEnabled ? (
                <Suspense fallback={<div className="rounded-full border border-white/10 px-4 py-2 text-sm text-signal-fog/65">AI 面板加载中...</div>}>
                  <AIAnalysisPanel runId={runId} runStatus={details?.runtime.status} />
                </Suspense>
              ) : null}
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {metadataItems.map((item) => (
              <div
                key={item.label}
                className={`rounded-full border px-3 py-1.5 text-sm ${item.label === "状态" ? statusTone : "border-white/10 text-signal-fog/75"}`}
              >
                <span className="mr-2 text-signal-fog/45">{item.label}</span>
                <span className="text-signal-fog/88">{item.value}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="总请求" value={Number(overview.totalRequests ?? 0)} />
            <MetricCard label="当前 RPS" value={Number(overview.summaryRequestThroughput ?? overview.bestRps ?? 0)} accent="cyan" />
            <MetricCard label="当前延迟" value={Number(overview.summaryAvgLatencySec ?? overview.bestLatencySec ?? 0)} unit="sec" accent="copper" />
            <MetricCard label="当前 TTFT" value={Number(overview.summaryAvgTtftSec ?? 0)} unit="sec" accent="copper" />
            <MetricCard label="输出吞吐" value={Number(overview.summaryOutputTokensPerSec ?? 0)} unit="tok/s" accent="cyan" />
            <MetricCard label="成功率" value={Number(overview.summarySuccessRate ?? 0)} unit="%" accent="ember" />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaryFacts.map((item) => (
              <div key={item.label} className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/48">{item.label}</div>
                <div className="mt-2 text-lg text-signal-fog/88">
                  {typeof item.value === "number" ? formatNumber(item.value) : item.value ?? "--"}
                  <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal-fog/40">{item.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <Suspense fallback={<div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-signal-fog/70">图表加载中...</div>}>
          <ChartsPanel ref={chartsRef} metrics={report.perConcurrency} percentiles={report.percentiles} />
        </Suspense>

        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionCard title="Diagnosis Cards" kicker="Interpretation">
            <div className="space-y-3">
              {report.diagnosis.map((item) => (
                <div key={item} className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-signal-fog/80">
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Raw Summary" kicker="Traceability">
            <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-signal-fog/75">
                {report.rawSummaryText || details?.commandPreview || "暂无原始摘要"}
              </pre>
            </div>
          </SectionCard>
        </div>

        {exportableAIEntries.length ? (
          <SectionCard title="AI Diagnosis Snapshot" kicker="Export Bundle">
            <div className="space-y-4">
              {exportableAIEntries.map(([mode, snapshot]) => (
                <div key={mode} className="rounded-[24px] border border-white/10 bg-black/18 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-lg font-medium text-white">{aiModeLabels[mode] ?? mode}</div>
                    {snapshot.updatedAt ? (
                      <div className="text-xs text-signal-fog/52">最近生成于 {formatDate(snapshot.updatedAt)}</div>
                    ) : null}
                  </div>
                  {snapshot.question ? (
                    <div className="mt-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-signal-fog/70">
                      附加问题：{snapshot.question}
                    </div>
                  ) : null}
                  <div className="ai-markdown mt-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {snapshot.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
