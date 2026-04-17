// ---------------------------------------------------------------------------
// Shared localStorage persistence for service connection & AI analysis config
// ---------------------------------------------------------------------------

/** 推理服务连接字段（跨 run 不变，持久化） */
export type ServiceConfig = {
  model: string;
  url: string;
  apiKey: string;
  tokenizerPath: string;
  datasetPath: string;
};

/** AI 分析模型配置 */
export type AIConfig = {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
};

export type AIAnalysisSnapshot = {
  content: string;
  question: string;
  updatedAt: string;
};

// ---- keys ----
const SERVICE_KEY = "pulsebench_service_config";
const AI_KEY = "pulsebench_ai_config";
const AI_ANALYSIS_KEY = "pulsebench_ai_analysis_cache";

// ---- generic helpers ----
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* corrupted – return fallback */
  }
  return fallback;
}

function saveJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or private mode */
  }
}

// ---- service config ----
const emptyServiceConfig: ServiceConfig = {
  model: "",
  url: "",
  apiKey: "",
  tokenizerPath: "",
  datasetPath: "",
};

export function loadServiceConfig(): ServiceConfig {
  return loadJSON(SERVICE_KEY, emptyServiceConfig);
}

export function saveServiceConfig(config: ServiceConfig): void {
  saveJSON(SERVICE_KEY, config);
}

// ---- AI config ----
const emptyAIConfig: AIConfig = {
  aiBaseUrl: "",
  aiApiKey: "",
  aiModel: "",
};

export function loadAIConfig(): AIConfig {
  return loadJSON(AI_KEY, emptyAIConfig);
}

export function saveAIConfig(config: AIConfig): void {
  saveJSON(AI_KEY, config);
}

// ---- AI analysis cache ----
type AIAnalysisCache = Record<string, Record<string, AIAnalysisSnapshot>>;

export function loadAIAnalysisCache(runId: string): Record<string, AIAnalysisSnapshot> {
  const cache = loadJSON<AIAnalysisCache>(AI_ANALYSIS_KEY, {});
  return cache[runId] ?? {};
}

export function saveAIAnalysisSnapshot(runId: string, mode: string, snapshot: AIAnalysisSnapshot): void {
  const cache = loadJSON<AIAnalysisCache>(AI_ANALYSIS_KEY, {});
  saveJSON(AI_ANALYSIS_KEY, {
    ...cache,
    [runId]: {
      ...(cache[runId] ?? {}),
      [mode]: snapshot,
    },
  });
}
