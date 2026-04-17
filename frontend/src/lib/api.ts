import type {
  AgentExecuteRequest,
  AgentStrategyRequest,
  AgentStrategyResponse,
  BatchDetails,
  BatchManifest,
  BatchReport,
  BatchRuntime,
  BatchRunConfig,
  ConfigMeta,
  HistoryItem,
  RunDetails,
  RunManifest,
  RunReport,
  RunRuntime,
  RunSpec,
  ScenarioTemplate,
} from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getConfigMeta: () => request<ConfigMeta>("/api/config/meta"),
  getTemplates: () => request<ScenarioTemplate[]>("/api/templates"),
  planAgentStrategy: (payload: AgentStrategyRequest) =>
    request<AgentStrategyResponse>("/api/agent/strategy", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  executeAgentStrategy: (payload: AgentExecuteRequest) =>
    request<BatchManifest>("/api/agent/strategy/execute", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createRun: (spec: RunSpec) =>
    request<RunManifest>("/api/runs", {
      method: "POST",
      body: JSON.stringify(spec),
    }),
  getRun: (runId: string) => request<RunDetails>(`/api/runs/${runId}`),
  stopRun: (runId: string) =>
    request<RunRuntime>(`/api/runs/${runId}/stop`, {
      method: "POST",
    }),
  getReport: (runId: string) => request<RunReport>(`/api/runs/${runId}/report`),
  getHistory: () => request<HistoryItem[]>("/api/history"),
  createBatch: (payload: {
    templateId: string;
    mode: "quick_check" | "template";
    title?: string;
    runs: BatchRunConfig[];
  }) =>
    request<BatchManifest>("/api/batches", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getBatches: () => request<BatchManifest[]>("/api/batches"),
  getBatch: (batchId: string) => request<BatchDetails>(`/api/batches/${batchId}`),
  stopBatch: (batchId: string) =>
    request<BatchRuntime>(`/api/batches/${batchId}/stop`, {
      method: "POST",
    }),
  getBatchReport: (batchId: string) => request<BatchReport>(`/api/batches/${batchId}/report`),
  async streamAI(
    runId: string,
    mode: string,
    question?: string,
    onDelta?: (chunk: string) => void,
    aiConfig?: { aiBaseUrl?: string; aiApiKey?: string; aiModel?: string },
  ) {
    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId,
        mode,
        question,
        ...(aiConfig?.aiBaseUrl ? { aiBaseUrl: aiConfig.aiBaseUrl } : {}),
        ...(aiConfig?.aiApiKey ? { aiApiKey: aiConfig.aiApiKey } : {}),
        ...(aiConfig?.aiModel ? { aiModel: aiConfig.aiModel } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(await response.text());
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as { type: string; content?: string; message?: string };
          if (payload.type === "delta" && payload.content) onDelta?.(payload.content);
          if (payload.type === "error") throw new Error(payload.message ?? "AI 请求失败");
          if (payload.type === "done") {
            await reader.cancel();
            return;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
    }
  },
  testAI: (aiConfig?: { aiBaseUrl?: string; aiApiKey?: string; aiModel?: string }) =>
    request<{
      ok: boolean;
      message: string;
      model: string;
      endpoint?: string;
      latencyMs?: number | null;
      responsePreview?: string | null;
      statusCode?: number | null;
    }>("/api/ai/test", {
      method: "POST",
      body: JSON.stringify({
        ...(aiConfig?.aiBaseUrl ? { aiBaseUrl: aiConfig.aiBaseUrl } : {}),
        ...(aiConfig?.aiApiKey ? { aiApiKey: aiConfig.aiApiKey } : {}),
        ...(aiConfig?.aiModel ? { aiModel: aiConfig.aiModel } : {}),
      }),
    }),
};
