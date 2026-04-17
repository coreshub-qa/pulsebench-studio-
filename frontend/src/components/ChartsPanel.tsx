import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { PercentileMetric, PerConcurrency } from "../lib/types";
import type { ReportChartSnapshots } from "../lib/reportExport";
import { SectionCard } from "./SectionCard";

export type ChartsPanelHandle = {
  captureSnapshots: () => ReportChartSnapshots;
};

export const ChartsPanel = forwardRef<ChartsPanelHandle, {
  metrics: PerConcurrency[];
  percentiles: PercentileMetric[];
}>(
function ChartsPanel({
  metrics,
  percentiles,
}, ref) {
  const tradeoffRef = useRef<ReactECharts | null>(null);
  const percentileRef = useRef<ReactECharts | null>(null);
  const xAxis = metrics.map((item) => item.concurrency);
  const concurrencyOptions = Array.from(new Set(percentiles.map((item) => item.concurrency))).sort((a, b) => a - b);
  const defaultConcurrency = concurrencyOptions.length ? concurrencyOptions[concurrencyOptions.length - 1] : 0;
  const [selectedConcurrency, setSelectedConcurrency] = useState<number>(defaultConcurrency);

  useImperativeHandle(ref, () => ({
    captureSnapshots() {
      const tradeoff = tradeoffRef.current?.getEchartsInstance().getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#11181f",
      });
      const percentile = percentileRef.current?.getEchartsInstance().getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#11181f",
      });
      return {
        ...(tradeoff ? { tradeoff } : {}),
        ...(percentile ? { percentile } : {}),
      };
    },
  }), []);

  useEffect(() => {
    if (!concurrencyOptions.length) {
      if (selectedConcurrency !== 0) {
        setSelectedConcurrency(0);
      }
      return;
    }
    if (!concurrencyOptions.includes(selectedConcurrency)) {
      setSelectedConcurrency(defaultConcurrency);
    }
  }, [concurrencyOptions, defaultConcurrency, selectedConcurrency]);

  const selectedPercentiles = percentiles.filter((item) => item.concurrency === selectedConcurrency);
  const percentileLabels = selectedPercentiles.map((item) => item.percentile);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr]">
      <SectionCard title="Tradeoff Matrix" kicker="Throughput vs Latency">
        <ReactECharts
          ref={tradeoffRef}
          style={{ height: 340 }}
          option={{
            backgroundColor: "transparent",
            tooltip: { trigger: "axis" },
            legend: { textStyle: { color: "#d5dfdb" } },
            grid: { left: 50, right: 20, top: 40, bottom: 40 },
            xAxis: {
              type: "category",
              data: xAxis,
              axisLabel: { color: "#d5dfdb" },
            },
            yAxis: [
              {
                type: "value",
                name: "RPS",
                axisLabel: { color: "#6bf7da" },
                splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
              },
              {
                type: "value",
                name: "Latency(s)",
                axisLabel: { color: "#d68b42" },
              },
            ],
            series: [
              {
                name: "RPS",
                type: "line",
                smooth: true,
                yAxisIndex: 0,
                data: metrics.map((item) => item.requestThroughput ?? 0),
                lineStyle: { color: "#6bf7da", width: 3 },
                itemStyle: { color: "#6bf7da" },
              },
              {
                name: "Avg Latency",
                type: "line",
                smooth: true,
                yAxisIndex: 1,
                data: metrics.map((item) => item.avgLatencySec ?? 0),
                lineStyle: { color: "#d68b42", width: 3 },
                itemStyle: { color: "#d68b42" },
              },
            ],
          }}
        />
      </SectionCard>

      <SectionCard title="Percentile Lens" kicker="Tail Behavior">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {concurrencyOptions.map((concurrency) => (
            <button
              key={concurrency}
              type="button"
              onClick={() => setSelectedConcurrency(concurrency)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                concurrency === selectedConcurrency
                  ? "border-[rgba(107,247,218,0.55)] bg-[rgba(107,247,218,0.12)] text-[#dff8f1]"
                  : "border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#94a6a0] hover:border-[rgba(255,255,255,0.16)] hover:text-[#d5dfdb]"
              }`}
            >
              并发 {concurrency}
            </button>
          ))}
        </div>
        <ReactECharts
          ref={percentileRef}
          style={{ height: 340 }}
          option={{
            backgroundColor: "transparent",
            tooltip: { trigger: "axis" },
            legend: { textStyle: { color: "#d5dfdb" } },
            grid: { left: 50, right: 20, top: 20, bottom: 40 },
            xAxis: {
              type: "category",
              data: percentileLabels,
              axisLabel: { color: "#d5dfdb" },
            },
            yAxis: {
              type: "value",
              axisLabel: { color: "#d5dfdb" },
              splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
            },
            series: [
              {
                name: "Latency",
                type: "bar",
                data: selectedPercentiles.map((item) => item.latencySec ?? 0),
                itemStyle: { color: "#ff6f3d", borderRadius: [8, 8, 0, 0] },
              },
              {
                name: "TTFT",
                type: "line",
                smooth: true,
                data: selectedPercentiles.map((item) => item.ttftSec ?? 0),
                lineStyle: { color: "#6bf7da", width: 2 },
                itemStyle: { color: "#6bf7da" },
              },
            ],
          }}
        />
      </SectionCard>
    </div>
  );
});

export default ChartsPanel;
