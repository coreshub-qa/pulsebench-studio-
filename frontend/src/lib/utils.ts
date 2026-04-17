import { clsx } from "clsx";
import type { BatchStatus, RunSpec, RunStatus } from "./types";

export function cn(...values: Array<string | false | null | undefined>) {
  return clsx(values);
}

export function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatNumber(value?: number | null, digits = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) return "--";
  return Number(value).toFixed(digits);
}

export function parseNumberList(value: string): number[] {
  return value
    .split(/[，, ]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export function buildCommandPreview(spec: RunSpec) {
  const parts: string[] = [
    "evalscope perf",
    `--model ${spec.model || "<MODEL>"}`,
    `--url ${normalizeUrl(spec.url || "<API_URL>")}`,
    `--parallel ${spec.parallel.join(" ")}`,
    `--number ${spec.number.join(" ")}`,
    `--dataset ${spec.dataset}`,
  ];

  if (spec.tokenizerPath) parts.push(`--tokenizer-path ${spec.tokenizerPath}`);
  if (spec.datasetPath) parts.push(`--dataset-path ${spec.datasetPath}`);
  if (spec.minPromptLength) parts.push(`--min-prompt-length ${spec.minPromptLength}`);
  if (spec.maxPromptLength) parts.push(`--max-prompt-length ${spec.maxPromptLength}`);
  if (spec.minTokens) parts.push(`--min-tokens ${spec.minTokens}`);
  if (spec.maxTokens) parts.push(`--max-tokens ${spec.maxTokens}`);
  if (spec.extraArgs && Object.keys(spec.extraArgs).length > 0) {
    parts.push(`--extra-args '${JSON.stringify(spec.extraArgs)}'`);
  }
  if (spec.apiKey) parts.push("--api-key ******");

  return parts.join(" \\\n  ");
}

function normalizeUrl(url: string) {
  if (!url) return "<API_URL>/chat/completions";
  if (url.endsWith("/chat/completions") || url.endsWith("/completions")) return url;
  if (url.endsWith("/v1")) return `${url}/chat/completions`;
  return `${url.replace(/\/$/, "")}/chat/completions`;
}

export function getStatusTone(status: RunStatus) {
  switch (status) {
    case "success":
      return "text-signal-cyan border-signal-cyan/50";
    case "failed":
      return "text-signal-ember border-signal-ember/50";
    case "stopped":
      return "text-signal-copper border-signal-copper/50";
    default:
      return "text-signal-fog border-white/10";
  }
}

export function getBatchStatusTone(status: BatchStatus) {
  if (status === "partial") return "text-signal-copper border-signal-copper/50";
  return getStatusTone(status as RunStatus);
}
