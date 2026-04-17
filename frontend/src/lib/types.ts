export type RunStatus = "pending" | "starting" | "running" | "success" | "failed" | "stopped";
export type BatchStatus = "pending" | "running" | "success" | "failed" | "partial" | "stopped";
export type BatchMode = "quick_check" | "template" | "agent";

export type ConfigMeta = {
  datasets: Array<{ value: string; label: string; hint?: string }>;
  rules: Record<
    string,
    {
      requires?: string[];
      recommendedPromptRange?: {
        min: number;
        max: number;
      };
      tip?: string;
    }
  >;
  defaults: {
    parallel: number[];
    number: number[];
    dataset: string;
    minPromptLength: number;
    maxPromptLength: number;
    minTokens: number;
    maxTokens: number;
    aiEnabled: boolean;
  };
};

export type RunSpec = {
  title?: string;
  model: string;
  url: string;
  apiKey?: string;
  parallel: number[];
  number: number[];
  dataset: string;
  tokenizerPath?: string;
  datasetPath?: string;
  minPromptLength?: number;
  maxPromptLength?: number;
  minTokens?: number;
  maxTokens?: number;
  extraArgs?: Record<string, unknown>;
  aiEnabled: boolean;
};

export type TemplateMatrixItem = {
  label: string;
  objective: string;
  dataset?: string | null;
  datasetPath?: string | null;
  minPromptLength: number;
  maxPromptLength: number;
  minTokens: number;
  maxTokens: number;
  parallel: number[];
  number: number[];
};

export type ScenarioTemplate = {
  id: string;
  name: string;
  mode: "quick_check" | "template";
  description: string;
  dataset: string;
  requiresTokenizerPath: boolean;
  focusMetrics: string[];
  defaultParams: Record<string, unknown>;
  matrix: TemplateMatrixItem[];
  reportPreset: string;
};

export type RunEvent = {
  type: "stage" | "log" | "warning" | "done";
  ts: string;
  message: string;
  phase?: string;
  level?: "info" | "warning" | "error";
};

export type RunManifest = {
  runId: string;
  title: string;
  commandPreview: string;
  status: RunStatus;
  createdAt: string;
};

export type RunRuntime = {
  runId: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  exitCode?: number | null;
  phase: string;
  message: string;
};

export type RunDetails = {
  runId: string;
  runtime: RunRuntime;
  commandPreview: string;
  spec: RunSpec;
  hasReport: boolean;
};

export type HistoryItem = {
  runId: string;
  title: string;
  model: string;
  status: RunStatus;
  createdAt: string;
  bestRps?: number | null;
  bestLatencySec?: number | null;
  totalRequests?: number | null;
};

export type PerConcurrency = {
  concurrency: number;
  requestThroughput?: number | null;
  avgLatencySec?: number | null;
  avgTtftSec?: number | null;
  avgTpotSec?: number | null;
  outputTokensPerSec?: number | null;
  successRate?: number | null;
};

export type PercentileMetric = {
  concurrency: number;
  percentile: string;
  latencySec?: number | null;
  ttftSec?: number | null;
  tpotSec?: number | null;
  itlSec?: number | null;
};

export type RunReport = {
  overview: Record<string, string | number | null>;
  perConcurrency: PerConcurrency[];
  percentiles: PercentileMetric[];
  diagnosis: string[];
  artifacts: {
    rawDir: string;
    hasLogs: boolean;
  };
  rawSummaryText?: string | null;
};

export type BatchRunConfig = {
  label: string;
  objective: string;
  spec: RunSpec;
};

export type BatchManifest = {
  batchId: string;
  templateId: string;
  mode: BatchMode;
  title: string;
  status: BatchStatus;
  createdAt: string;
  totalRuns: number;
};

export type BatchRuntime = {
  batchId: string;
  templateId: string;
  mode: BatchMode;
  title: string;
  status: BatchStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  currentIndex: number;
  totalRuns: number;
  message: string;
};

export type BatchItem = {
  runId: string;
  label: string;
  objective: string;
  title: string;
  status: RunStatus;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  reportOverview?: Record<string, string | number | null> | null;
};

export type BatchDetails = {
  batchId: string;
  runtime: BatchRuntime;
  request: {
    templateId: string;
    mode: BatchMode;
    title?: string;
    runs: BatchRunConfig[];
  };
  items: BatchItem[];
  hasReport: boolean;
};

export type BatchReportItem = {
  runId: string;
  label: string;
  objective: string;
  title: string;
  status: RunStatus;
  bestRps?: number | null;
  bestLatencySec?: number | null;
  totalRequests?: number | null;
  successRate?: number | null;
};

export type BatchReport = {
  overview: Record<string, string | number | null>;
  items: BatchReportItem[];
  diagnosis: string[];
};

export type AgentGoal = "health_check" | "interactive_experience" | "balanced_throughput" | "long_context" | "capacity_limit";
export type AgentWorkloadType = "chat_short" | "chat_long_output" | "rag_medium_context" | "long_context_analysis" | "code_generation" | "unknown";
export type AgentAggressiveness = "conservative" | "balanced" | "aggressive";
export type AgentConfidence = "low" | "medium" | "high";

export type AgentStrategyRequest = {
  goal: AgentGoal;
  model: string;
  url: string;
  apiKey?: string;
  parameterScale?: string;
  contextWindow?: number | null;
  gpuModel?: string;
  gpuCount?: number | null;
  gpuMemoryGb?: number | null;
  engine?: string;
  quantization?: string;
  tokenizerPath?: string;
  workloadType?: AgentWorkloadType;
  typicalPromptLength?: number | null;
  typicalOutputLength?: number | null;
  stream?: boolean;
  timeBudget?: string;
  aggressiveness?: AgentAggressiveness;
  question?: string;
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
};

export type AgentGuardrails = {
  templateBasis: string;
  preferredDataset: string;
  datasetCandidates: string[];
  focusMetrics: string[];
  recommendedConcurrency: number[];
  promptRange: {
    min: number;
    max: number;
  };
  tokenRange: {
    min: number;
    max: number;
  };
  requiresTokenizer: boolean;
  assumptions: string[];
  notes: string[];
};

export type AgentStrategyRun = {
  label: string;
  objective: string;
  reasoning: string;
  spec: RunSpec;
};

export type AgentStrategyDraft = {
  templateId: string;
  mode: "agent";
  title: string;
  summary: string;
  strategyType: string;
  confidence: AgentConfidence;
  assumptions: string[];
  warnings: string[];
  focusMetrics: string[];
  runs: AgentStrategyRun[];
};

export type AgentStrategyResponse = {
  request: AgentStrategyRequest;
  guardrails: AgentGuardrails;
  draft: AgentStrategyDraft;
};

export type AgentExecuteRequest = {
  draft: AgentStrategyDraft;
};
