from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, SecretStr, field_validator, model_validator


RunStatus = Literal["pending", "starting", "running", "success", "failed", "stopped"]
BatchStatus = Literal["pending", "running", "success", "failed", "partial", "stopped"]
BatchMode = Literal["quick_check", "template", "agent"]
EventType = Literal["stage", "log", "warning", "done"]
AIAnalyzeMode = Literal["overview", "bottleneck", "next_step", "failure"]
AgentGoal = Literal["health_check", "interactive_experience", "balanced_throughput", "long_context", "capacity_limit"]
AgentWorkloadType = Literal["chat_short", "chat_long_output", "rag_medium_context", "long_context_analysis", "code_generation", "unknown"]
AgentAggressiveness = Literal["conservative", "balanced", "aggressive"]
AgentConfidence = Literal["low", "medium", "high"]


class RunSpec(BaseModel):
    title: str | None = None
    model: str = Field(min_length=1)
    url: str = Field(min_length=1)
    api_key: SecretStr | None = Field(default=None, alias="apiKey")
    parallel: list[int] = Field(default_factory=lambda: [1])
    number: list[int] = Field(default_factory=lambda: [10])
    dataset: str = "random"
    tokenizer_path: str | None = Field(default=None, alias="tokenizerPath")
    dataset_path: str | None = Field(default=None, alias="datasetPath")
    min_prompt_length: int | None = Field(default=None, alias="minPromptLength")
    max_prompt_length: int | None = Field(default=None, alias="maxPromptLength")
    min_tokens: int | None = Field(default=None, alias="minTokens")
    max_tokens: int | None = Field(default=None, alias="maxTokens")
    extra_args: dict[str, Any] | None = Field(default=None, alias="extraArgs")
    ai_enabled: bool = Field(default=True, alias="aiEnabled")

    model_config = {"populate_by_name": True}

    @field_validator("parallel", "number")
    @classmethod
    def _validate_integer_lists(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("至少需要一个数值")
        if any(item <= 0 for item in value):
            raise ValueError("数值必须大于 0")
        return value

    @model_validator(mode="after")
    def _validate_cross_fields(self) -> "RunSpec":
        if len(self.parallel) != len(self.number):
            raise ValueError("parallel 与 number 长度必须一致")
        if self.dataset == "random" and not self.tokenizer_path:
            raise ValueError("random 数据集模式必须提供 tokenizerPath")
        if self.dataset in {"line_by_line", "custom"} and not self.dataset_path:
            raise ValueError(f"{self.dataset} 模式必须提供 datasetPath")
        return self

    def public_dict(self) -> dict[str, Any]:
        data = self.model_dump(by_alias=True)
        data["apiKey"] = bool(self.api_key)
        return data


class RunRuntime(BaseModel):
    run_id: str = Field(alias="runId")
    status: RunStatus
    created_at: datetime = Field(alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    finished_at: datetime | None = Field(default=None, alias="finishedAt")
    exit_code: int | None = Field(default=None, alias="exitCode")
    phase: str = "queued"
    message: str = "等待启动"

    model_config = {"populate_by_name": True}


class RunManifest(BaseModel):
    run_id: str = Field(alias="runId")
    title: str
    command_preview: str = Field(alias="commandPreview")
    status: RunStatus
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class RunEvent(BaseModel):
    type: EventType
    ts: datetime
    message: str
    phase: str | None = None
    level: Literal["info", "warning", "error"] = "info"


class PerConcurrencyMetric(BaseModel):
    concurrency: int
    request_throughput: float | None = Field(default=None, alias="requestThroughput")
    avg_latency_sec: float | None = Field(default=None, alias="avgLatencySec")
    avg_ttft_sec: float | None = Field(default=None, alias="avgTtftSec")
    avg_tpot_sec: float | None = Field(default=None, alias="avgTpotSec")
    output_tokens_per_sec: float | None = Field(default=None, alias="outputTokensPerSec")
    success_rate: float | None = Field(default=None, alias="successRate")

    model_config = {"populate_by_name": True}


class PercentileMetric(BaseModel):
    concurrency: int
    percentile: str
    latency_sec: float | None = Field(default=None, alias="latencySec")
    ttft_sec: float | None = Field(default=None, alias="ttftSec")
    tpot_sec: float | None = Field(default=None, alias="tpotSec")
    itl_sec: float | None = Field(default=None, alias="itlSec")

    model_config = {"populate_by_name": True}


class RunReport(BaseModel):
    overview: dict[str, Any]
    per_concurrency: list[PerConcurrencyMetric] = Field(default_factory=list, alias="perConcurrency")
    percentiles: list[PercentileMetric] = Field(default_factory=list)
    diagnosis: list[str] = Field(default_factory=list)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    raw_summary_text: str | None = Field(default=None, alias="rawSummaryText")

    model_config = {"populate_by_name": True}


class HistoryItem(BaseModel):
    run_id: str = Field(alias="runId")
    title: str
    model: str
    status: RunStatus
    created_at: datetime = Field(alias="createdAt")
    best_rps: float | None = Field(default=None, alias="bestRps")
    best_latency_sec: float | None = Field(default=None, alias="bestLatencySec")
    total_requests: int | None = Field(default=None, alias="totalRequests")

    model_config = {"populate_by_name": True}


class AIAnalyzeRequest(BaseModel):
    run_id: str = Field(alias="runId")
    mode: AIAnalyzeMode = "overview"
    question: str | None = None
    ai_base_url: str | None = Field(default=None, alias="aiBaseUrl")
    ai_api_key: str | None = Field(default=None, alias="aiApiKey")
    ai_model: str | None = Field(default=None, alias="aiModel")

    model_config = {"populate_by_name": True}


class AITestRequest(BaseModel):
    ai_base_url: str | None = Field(default=None, alias="aiBaseUrl")
    ai_api_key: str | None = Field(default=None, alias="aiApiKey")
    ai_model: str | None = Field(default=None, alias="aiModel")

    model_config = {"populate_by_name": True}


class ConfigFieldOption(BaseModel):
    value: str
    label: str
    hint: str | None = None


class ConfigMeta(BaseModel):
    datasets: list[ConfigFieldOption]
    rules: dict[str, dict[str, Any]]
    defaults: dict[str, Any]


class TemplateMatrixItem(BaseModel):
    label: str
    objective: str
    dataset: str | None = None
    dataset_path: str | None = Field(default=None, alias="datasetPath")
    min_prompt_length: int = Field(alias="minPromptLength")
    max_prompt_length: int = Field(alias="maxPromptLength")
    min_tokens: int = Field(alias="minTokens")
    max_tokens: int = Field(alias="maxTokens")
    parallel: list[int]
    number: list[int]

    model_config = {"populate_by_name": True}


class ScenarioTemplate(BaseModel):
    id: str
    name: str
    mode: Literal["quick_check", "template"]
    description: str
    dataset: str
    requires_tokenizer_path: bool = Field(alias="requiresTokenizerPath")
    focus_metrics: list[str] = Field(alias="focusMetrics")
    default_params: dict[str, Any] = Field(alias="defaultParams")
    matrix: list[TemplateMatrixItem]
    report_preset: str = Field(alias="reportPreset")

    model_config = {"populate_by_name": True}


class BatchRunConfig(BaseModel):
    label: str
    objective: str
    spec: RunSpec


class BatchCreateRequest(BaseModel):
    template_id: str = Field(alias="templateId")
    mode: BatchMode = "template"
    title: str | None = None
    runs: list[BatchRunConfig]

    model_config = {"populate_by_name": True}

    def public_dict(self) -> dict[str, Any]:
        payload = self.model_dump(by_alias=True)
        safe_runs: list[dict[str, Any]] = []
        for item in self.runs:
            safe_runs.append(
                {
                    "label": item.label,
                    "objective": item.objective,
                    "spec": item.spec.public_dict(),
                }
            )
        payload["runs"] = safe_runs
        return payload


class BatchRunItem(BaseModel):
    run_id: str = Field(alias="runId")
    label: str
    objective: str
    title: str
    status: RunStatus
    created_at: datetime = Field(alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    finished_at: datetime | None = Field(default=None, alias="finishedAt")
    report_overview: dict[str, Any] | None = Field(default=None, alias="reportOverview")

    model_config = {"populate_by_name": True}


class BatchRuntime(BaseModel):
    batch_id: str = Field(alias="batchId")
    template_id: str = Field(alias="templateId")
    mode: BatchMode
    title: str
    status: BatchStatus
    created_at: datetime = Field(alias="createdAt")
    started_at: datetime | None = Field(default=None, alias="startedAt")
    finished_at: datetime | None = Field(default=None, alias="finishedAt")
    current_index: int = Field(default=0, alias="currentIndex")
    total_runs: int = Field(alias="totalRuns")
    message: str = "等待启动"

    model_config = {"populate_by_name": True}


class BatchManifest(BaseModel):
    batch_id: str = Field(alias="batchId")
    template_id: str = Field(alias="templateId")
    mode: BatchMode
    title: str
    status: BatchStatus
    created_at: datetime = Field(alias="createdAt")
    total_runs: int = Field(alias="totalRuns")

    model_config = {"populate_by_name": True}


class BatchReportItem(BaseModel):
    run_id: str = Field(alias="runId")
    label: str
    objective: str
    title: str
    status: RunStatus
    best_rps: float | None = Field(default=None, alias="bestRps")
    best_latency_sec: float | None = Field(default=None, alias="bestLatencySec")
    total_requests: int | None = Field(default=None, alias="totalRequests")
    success_rate: float | None = Field(default=None, alias="successRate")

    model_config = {"populate_by_name": True}


class BatchReport(BaseModel):
    overview: dict[str, Any]
    items: list[BatchReportItem]
    diagnosis: list[str]


class AgentStrategyRequest(BaseModel):
    goal: AgentGoal
    model: str = Field(min_length=1)
    url: str = Field(min_length=1)
    api_key: SecretStr | None = Field(default=None, alias="apiKey")
    parameter_scale: str | None = Field(default=None, alias="parameterScale")
    context_window: int | None = Field(default=None, alias="contextWindow")
    gpu_model: str | None = Field(default=None, alias="gpuModel")
    gpu_count: int | None = Field(default=None, alias="gpuCount")
    gpu_memory_gb: int | None = Field(default=None, alias="gpuMemoryGb")
    engine: str | None = None
    quantization: str | None = None
    tokenizer_path: str | None = Field(default=None, alias="tokenizerPath")
    workload_type: AgentWorkloadType = Field(default="unknown", alias="workloadType")
    typical_prompt_length: int | None = Field(default=None, alias="typicalPromptLength")
    typical_output_length: int | None = Field(default=None, alias="typicalOutputLength")
    stream: bool | None = True
    time_budget: str | None = Field(default=None, alias="timeBudget")
    aggressiveness: AgentAggressiveness = "balanced"
    question: str | None = None
    ai_base_url: str | None = Field(default=None, alias="aiBaseUrl")
    ai_api_key: str | None = Field(default=None, alias="aiApiKey")
    ai_model: str | None = Field(default=None, alias="aiModel")

    model_config = {"populate_by_name": True}

    @field_validator("context_window", "gpu_count", "gpu_memory_gb", "typical_prompt_length", "typical_output_length")
    @classmethod
    def _validate_positive_optional_int(cls, value: int | None) -> int | None:
        if value is not None and value <= 0:
            raise ValueError("数值必须大于 0")
        return value


class AgentGuardrails(BaseModel):
    template_basis: str = Field(alias="templateBasis")
    preferred_dataset: str = Field(alias="preferredDataset")
    dataset_candidates: list[str] = Field(alias="datasetCandidates")
    focus_metrics: list[str] = Field(alias="focusMetrics")
    recommended_concurrency: list[int] = Field(alias="recommendedConcurrency")
    prompt_range: dict[str, int] = Field(alias="promptRange")
    token_range: dict[str, int] = Field(alias="tokenRange")
    requires_tokenizer: bool = Field(alias="requiresTokenizer")
    assumptions: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class AgentStrategyRun(BaseModel):
    label: str
    objective: str
    reasoning: str
    spec: RunSpec


class AgentStrategyDraft(BaseModel):
    template_id: str = Field(default="agent_generated", alias="templateId")
    mode: Literal["agent"] = "agent"
    title: str
    summary: str
    strategy_type: str = Field(alias="strategyType")
    confidence: AgentConfidence = "medium"
    assumptions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    focus_metrics: list[str] = Field(default_factory=list, alias="focusMetrics")
    runs: list[AgentStrategyRun]

    model_config = {"populate_by_name": True}

    @field_validator("runs")
    @classmethod
    def _validate_runs(cls, value: list[AgentStrategyRun]) -> list[AgentStrategyRun]:
        if not value:
            raise ValueError("至少需要一个测试项")
        return value


class AgentStrategyResponse(BaseModel):
    request: AgentStrategyRequest
    guardrails: AgentGuardrails
    draft: AgentStrategyDraft

    model_config = {"populate_by_name": True}


class AgentExecuteRequest(BaseModel):
    draft: AgentStrategyDraft

    model_config = {"populate_by_name": True}
