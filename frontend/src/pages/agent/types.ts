import type { AgentAggressiveness, AgentGoal, AgentWorkloadType } from "../../lib/types";

export type PlannerForm = {
  goal: AgentGoal;
  model: string;
  url: string;
  apiKey: string;
  parameterScale: string;
  contextWindow: string;
  gpuModel: string;
  gpuCount: string;
  gpuMemoryGb: string;
  engine: string;
  quantization: string;
  tokenizerPath: string;
  workloadType: AgentWorkloadType;
  typicalPromptLength: string;
  typicalOutputLength: string;
  stream: boolean;
  timeBudget: string;
  aggressiveness: AgentAggressiveness;
  question: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
};
