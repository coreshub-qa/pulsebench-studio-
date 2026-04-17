import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import type { BatchReport } from "../lib/types";
import { formatNumber, getStatusTone } from "../lib/utils";

export function BatchReportPage() {
  const { batchId = "" } = useParams();
  const [report, setReport] = useState<BatchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getBatchReport(batchId).then(setReport).catch((err) => setError(err instanceof Error ? err.message : "批次报告加载失败"));
  }, [batchId]);

  if (error) {
    return <div className="rounded-[28px] border border-signal-ember/30 bg-signal-ember/10 p-6 text-signal-ember">{error}</div>;
  }

  if (!report) {
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-signal-fog/70">批次报告加载中...</div>;
  }

  const overview = report.overview;

  return (
    <div className="space-y-5">
      <SectionCard title="Batch Report" kicker="Template Summary">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total Runs" value={Number(overview.totalRuns ?? 0)} />
          <MetricCard label="Success" value={Number(overview.successfulRuns ?? 0)} accent="cyan" />
          <MetricCard label="Failed" value={Number(overview.failedRuns ?? 0)} accent="ember" />
          <MetricCard label="Best RPS" value={Number(overview.bestRps ?? 0)} accent="cyan" />
          <MetricCard label="Best Latency" value={Number(overview.bestLatencySec ?? 0)} unit="sec" accent="copper" />
        </div>
      </SectionCard>

      <SectionCard title="Batch Diagnosis" kicker="Topline Readout">
        <div className="space-y-3">
          {report.diagnosis.map((item) => (
            <div key={item} className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-signal-fog/80">
              {item}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Scenario Breakdown" kicker="Run Comparison">
        <div className="overflow-hidden rounded-[26px] border border-white/10">
          <table className="w-full border-collapse text-left">
            <thead className="bg-white/[0.04] font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">
              <tr>
                <th className="px-4 py-3">Scenario</th>
                <th className="px-4 py-3">Objective</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Best RPS</th>
                <th className="px-4 py-3">Best Latency</th>
                <th className="px-4 py-3">Requests</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.runId} className="border-t border-white/8 bg-black/15 text-sm text-signal-fog/80">
                  <td className="px-4 py-4 font-medium text-white">{item.label}</td>
                  <td className="px-4 py-4">{item.objective}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${getStatusTone(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono">{formatNumber(item.bestRps)}</td>
                  <td className="px-4 py-4 font-mono">{formatNumber(item.bestLatencySec)}</td>
                  <td className="px-4 py-4 font-mono">{formatNumber(item.totalRequests, 0)}</td>
                  <td className="px-4 py-4 text-right">
                    <Link to={`/report/${item.runId}`} className="text-signal-cyan transition hover:text-white">
                      单次报告
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
