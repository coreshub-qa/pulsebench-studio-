import { Square, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import type { BatchDetails, BatchItem, RunEvent } from "../lib/types";
import { formatDate, getBatchStatusTone, getStatusTone } from "../lib/utils";

export function BatchLivePage() {
  const { batchId = "" } = useParams();
  const [details, setDetails] = useState<BatchDetails | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const payload = await api.getBatch(batchId);
        if (!disposed) {
          setDetails(payload);
        }
        if (!disposed && ["pending", "running"].includes(payload.runtime.status)) {
          timer = window.setTimeout(poll, 2000);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "批次加载失败");
      }
    }
    void poll();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [batchId]);

  const activeItem = useMemo<BatchItem | null>(() => {
    if (!details?.items?.length || !details.runtime) return null;
    const runningItem = details.items.find((item) => ["starting", "running"].includes(item.status));
    return runningItem ?? details.items[details.runtime.currentIndex - 1] ?? null;
  }, [details]);

  useEffect(() => {
    const runId = activeItem?.runId;
    if (!runId) {
      setEvents([]);
      return;
    }
    setEvents([]);
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as RunEvent;
      setEvents((current) => [...current.slice(-199), payload]);
      if (payload.type === "done") {
        void api.getBatch(batchId).then(setDetails).catch(() => undefined);
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [activeItem?.runId, batchId]);

  async function handleStop() {
    setStopping(true);
    try {
      const runtime = await api.stopBatch(batchId);
      setDetails((current) => (current ? { ...current, runtime } : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "停止失败");
    } finally {
      setStopping(false);
    }
  }

  const runtime = details?.runtime;

  return (
    <div className="space-y-5">
      <SectionCard title={runtime?.title ?? "Batch Live"} kicker="Batch Orchestration">
        <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
          <div className="space-y-4">
            <div className={`inline-flex rounded-full border px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] ${getBatchStatusTone(runtime?.status ?? "pending")}`}>
              {runtime?.status ?? "pending"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Progress" value={`${runtime?.currentIndex ?? 0}/${runtime?.totalRuns ?? 0}`} accent="copper" />
              <MetricCard label="Mode" value={runtime?.mode ?? "--"} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Active Run" value={activeItem?.label ?? "--"} />
              <MetricCard label="Run Status" value={activeItem?.status ?? "--"} accent="copper" />
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Batch Message</div>
              <div className="mt-3 text-sm leading-7 text-signal-fog/80">{runtime?.message ?? "等待批次状态"}</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Current Objective</div>
              <div className="mt-3 text-sm leading-7 text-signal-fog/80">{activeItem?.objective ?? "等待批次展开当前场景"}</div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={!runtime || !["pending", "running"].includes(runtime.status) || stopping}
                className="inline-flex items-center gap-2 rounded-full border border-signal-ember/40 bg-signal-ember/10 px-4 py-2 text-sm text-signal-ember transition hover:bg-signal-ember/15 disabled:opacity-50"
              >
                <Square className="h-4 w-4" />
                {stopping ? "停止中..." : "停止批次"}
              </button>
              {details?.hasReport ? (
                <Link
                  to={`/batch-report/${batchId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-signal-cyan/35 bg-signal-cyan/10 px-4 py-2 text-sm text-signal-cyan shadow-glow"
                >
                  查看批次报告
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            {error ? <div className="rounded-2xl border border-signal-ember/30 bg-signal-ember/10 px-4 py-3 text-sm text-signal-ember">{error}</div> : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-black/25 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-display text-xl uppercase tracking-[0.12em] text-white">Live Rail</div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Current run event stream</div>
                </div>
                {activeItem ? (
                  <Link to={`/live/${activeItem.runId}`} className="text-sm text-signal-cyan transition hover:text-white">
                    打开单次运行页
                  </Link>
                ) : null}
              </div>
              <div className="h-[260px] overflow-auto rounded-[20px] border border-white/10 bg-graphite-950/80 p-4 font-mono text-xs leading-6 text-signal-fog/80">
                {events.length === 0 ? (
                  <div className="text-signal-fog/45">等待当前场景事件流...</div>
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

            <div className="rounded-[28px] border border-white/10 bg-black/25 p-4">
              <div className="mb-4 font-display text-xl uppercase tracking-[0.12em] text-white">Run Sequence</div>
              <div className="space-y-3">
                {details?.items.map((item) => (
                  <div key={item.runId} className="rounded-[22px] border border-white/10 bg-graphite-950/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-display text-lg uppercase tracking-[0.08em] text-white">{item.label}</div>
                        <div className="text-sm leading-7 text-signal-fog/72">{item.objective}</div>
                      </div>
                      <div className={`inline-flex rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] ${getStatusTone(item.status)}`}>
                        {item.status}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal-fog/55">
                      <span className="rounded-full border border-white/10 px-3 py-2">{formatDate(item.createdAt)}</span>
                      <span className="rounded-full border border-white/10 px-3 py-2">{item.runId}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link to={`/live/${item.runId}`} className="text-sm text-signal-fog/75 transition hover:text-white">
                        查看运行过程
                      </Link>
                      <Link to={`/report/${item.runId}`} className="text-sm text-signal-cyan transition hover:text-white">
                        查看单次报告
                      </Link>
                    </div>
                  </div>
                )) ?? <div className="text-sm text-signal-fog/55">等待批次展开...</div>}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
