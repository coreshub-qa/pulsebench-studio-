import { Square, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { SectionCard } from "../components/SectionCard";
import { api } from "../lib/api";
import type { RunDetails, RunEvent } from "../lib/types";
import { formatDate, getStatusTone } from "../lib/utils";

export function LiveRunPage() {
  const { runId = "" } = useParams();
  const [details, setDetails] = useState<RunDetails | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    void api.getRun(runId).then(setDetails).catch((err) => setError(err instanceof Error ? err.message : "加载失败"));
  }, [runId]);

  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as RunEvent;
      setEvents((current) => [...current.slice(-199), payload]);
      if (payload.type === "done") {
        void api.getRun(runId).then(setDetails).catch(() => undefined);
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [runId]);

  async function handleStop() {
    setStopping(true);
    try {
      const runtime = await api.stopRun(runId);
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
      <SectionCard title="Live Run" kicker="Telemetry Stream">
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <div className={`inline-flex rounded-full border px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] ${getStatusTone(runtime?.status ?? "pending")}`}>
              {runtime?.status ?? "pending"}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Created" value={formatDate(runtime?.createdAt)} accent="copper" />
              <MetricCard label="Phase" value={runtime?.phase ?? "--"} />
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Runtime Message</div>
              <div className="mt-3 text-sm leading-7 text-signal-fog/80">{runtime?.message ?? "等待后端返回运行状态"}</div>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/25 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">Command Preview</div>
              <pre className="mt-3 whitespace-pre-wrap break-all font-mono text-xs leading-6 text-signal-fog/80">{details?.commandPreview ?? "--"}</pre>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={stopping || !runtime || !["pending", "starting", "running"].includes(runtime.status)}
                className="inline-flex items-center gap-2 rounded-full border border-signal-ember/40 bg-signal-ember/10 px-4 py-2 text-sm text-signal-ember transition hover:bg-signal-ember/15 disabled:opacity-50"
              >
                <Square className="h-4 w-4" />
                {stopping ? "停止中..." : "停止任务"}
              </button>
              {details?.hasReport ? (
                <Link
                  to={`/report/${runId}`}
                  className="inline-flex items-center gap-2 rounded-full border border-signal-cyan/35 bg-signal-cyan/10 px-4 py-2 text-sm text-signal-cyan shadow-glow"
                >
                  查看报告
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
            {error ? <div className="rounded-2xl border border-signal-ember/30 bg-signal-ember/10 px-4 py-3 text-sm text-signal-ember">{error}</div> : null}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/25 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-display text-xl uppercase tracking-[0.12em] text-white">Event Rail</div>
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-signal-fog/55">No fake progress, only real phases</div>
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

