import { RefreshCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import type { BatchManifest, HistoryItem } from "../lib/types";
import { formatDate, formatNumber, getBatchStatusTone, getStatusTone } from "../lib/utils";

export function HistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [batches, setBatches] = useState<BatchManifest[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([api.getHistory(), api.getBatches()])
      .then(([runItems, batchItems]) => {
        setItems(runItems);
        setBatches(batchItems);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "历史记录加载失败"));
  }, []);

  const filtered = useMemo(
    () => items.filter((item) => `${item.title} ${item.model}`.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  function runTarget(runId: string, status: HistoryItem["status"]) {
    return ["pending", "starting", "running"].includes(status) ? `/live/${runId}` : `/report/${runId}`;
  }

  async function handleReplay(runId: string) {
    const run = await api.getRun(runId);
    navigate("/", {
      state: {
        prefill: {
          ...run.spec,
          title: `${run.spec.title || run.spec.model || "复跑任务"} · replay`,
          apiKey: "",
        },
      },
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Batch Archive" kicker="Scenario Campaigns">
        <div className="overflow-hidden rounded-[26px] border border-white/10">
          <table className="w-full border-collapse text-left">
            <thead className="bg-white/[0.04] font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Runs</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr key={item.batchId} className="border-t border-white/8 bg-black/15 text-sm text-signal-fog/80">
                  <td className="px-4 py-4 font-mono text-xs">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-4 font-medium text-white">{item.title}</td>
                  <td className="px-4 py-4 uppercase">{item.mode}</td>
                  <td className="px-4 py-4">{item.templateId}</td>
                  <td className="px-4 py-4 font-mono">{item.totalRuns}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${getBatchStatusTone(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link to={`/batch/${item.batchId}`} className="rounded-full border border-white/10 px-3 py-2 text-xs text-signal-fog transition hover:border-white/20 hover:text-white">
                        进度
                      </Link>
                      <Link to={`/batch-report/${item.batchId}`} className="rounded-full border border-signal-cyan/30 bg-signal-cyan/10 px-3 py-2 text-xs text-signal-cyan transition hover:bg-signal-cyan/15">
                        报告
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-signal-fog/50">
                    暂无批次记录
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Run Archive" kicker="Single Runs">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-signal-fog/45" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field pl-11"
            placeholder="按标题或模型检索"
          />
        </div>
        {error ? <div className="text-sm text-signal-ember">{error}</div> : null}
      </div>

      <div className="overflow-hidden rounded-[26px] border border-white/10">
        <table className="w-full border-collapse text-left">
          <thead className="bg-white/[0.04] font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">RPS</th>
              <th className="px-4 py-3">Latency</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.runId} className="border-t border-white/8 bg-black/15 text-sm text-signal-fog/80">
                <td className="px-4 py-4 font-mono text-xs">{formatDate(item.createdAt)}</td>
                <td className="px-4 py-4">
                  <Link to={runTarget(item.runId, item.status)} className="font-medium text-white transition hover:text-signal-cyan">
                    {item.title}
                  </Link>
                </td>
                <td className="px-4 py-4">{item.model}</td>
                <td className="px-4 py-4 font-mono">{formatNumber(item.bestRps)}</td>
                <td className="px-4 py-4 font-mono">{formatNumber(item.bestLatencySec)}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${getStatusTone(item.status)}`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Link to={runTarget(item.runId, item.status)} className="rounded-full border border-white/10 px-3 py-2 text-xs text-signal-fog transition hover:border-white/20 hover:text-white">
                      {["pending", "starting", "running"].includes(item.status) ? "进度" : "查看"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleReplay(item.runId)}
                      className="inline-flex items-center gap-2 rounded-full border border-signal-cyan/30 bg-signal-cyan/10 px-3 py-2 text-xs text-signal-cyan transition hover:bg-signal-cyan/15"
                    >
                      <RefreshCcw className="h-3.5 w-3.5" />
                      复跑
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-signal-fog/50">
                  暂无历史记录
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      </SectionCard>
    </div>
  );
}
