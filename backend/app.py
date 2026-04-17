from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from agent_service import draft_to_batch_request, generate_agent_strategy
from ai_service import stream_ai_analysis, test_ai_connection
from builtin_datasets import ensure_builtin_datasets
from config import get_settings
from run_manager import RunManager
from schemas import (
    AIAnalyzeRequest,
    AITestRequest,
    AgentExecuteRequest,
    AgentStrategyRequest,
    BatchCreateRequest,
    ConfigFieldOption,
    ConfigMeta,
    RunReport,
    RunSpec,
    ScenarioTemplate,
)
from templates import list_templates

settings = get_settings()
ensure_builtin_datasets(settings.builtin_datasets_dir)
manager = RunManager(settings)
app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _config_meta() -> ConfigMeta:
    return ConfigMeta(
        datasets=[
            ConfigFieldOption(value="random", label="随机文本", hint="需要 tokenizer 路径"),
            ConfigFieldOption(value="openqa", label="OpenQA", hint="短 prompt 基准"),
            ConfigFieldOption(value="longalpaca", label="LongAlpaca", hint="长上下文测试"),
            ConfigFieldOption(value="line_by_line", label="逐行文本", hint="需要 dataset 路径"),
            ConfigFieldOption(value="custom", label="自定义解析器", hint="需要 dataset 路径"),
            ConfigFieldOption(value="random_vl", label="随机多模态", hint="启用图文输入参数"),
        ],
        rules={
            "random": {
                "requires": ["tokenizerPath"],
                "recommendedPromptRange": {"min": 1024, "max": 1024},
                "tip": "随机文本模式适合做固定长度压测，推荐配合 tokenizer 路径。",
            },
            "openqa": {
                "recommendedPromptRange": {"min": 0, "max": 256},
                "tip": "OpenQA prompt 普遍较短，若最小长度设到 1024，数据很可能被全部过滤掉。",
            },
            "longalpaca": {
                "recommendedPromptRange": {"min": 4096, "max": 12288},
                "tip": "LongAlpaca 适合长上下文测试，建议把 prompt 长度范围拉高。",
            },
            "line_by_line": {
                "requires": ["datasetPath"],
                "recommendedPromptRange": {"min": 0, "max": 131072},
                "tip": "逐行文本模式取决于你提供的数据文件长度。",
            },
            "custom": {
                "requires": ["datasetPath"],
                "recommendedPromptRange": {"min": 0, "max": 131072},
                "tip": "自定义解析器模式下，请按数据集结构自行控制 prompt 长度条件。",
            },
            "random_vl": {
                "requires": ["tokenizerPath"],
                "recommendedPromptRange": {"min": 1024, "max": 1024},
                "tip": "随机多模态模式通常配合固定输入尺寸和固定 token 长度做基准测试。",
            },
        },
        defaults={
            "parallel": [1, 10],
            "number": [10, 20],
            "dataset": "random",
            "minPromptLength": 1024,
            "maxPromptLength": 1024,
            "minTokens": 1024,
            "maxTokens": 1024,
            "aiEnabled": True,
        },
    )


@app.get("/api/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config/meta")
async def get_config_meta() -> dict[str, object]:
    return _config_meta().model_dump()


@app.get("/api/templates")
async def get_templates() -> list[dict[str, object]]:
    return [
        ScenarioTemplate.model_validate(item).model_dump(by_alias=True)
        for item in list_templates(settings.builtin_datasets_dir)
    ]


@app.post("/api/runs")
async def create_run(spec: RunSpec) -> dict[str, object]:
    manifest = await manager.create_run(spec)
    return manifest.model_dump(by_alias=True)


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> dict[str, object]:
    return manager.get_manifest(run_id)


@app.post("/api/runs/{run_id}/stop")
async def stop_run(run_id: str) -> dict[str, object]:
    runtime = await manager.stop_run(run_id)
    return runtime.model_dump(by_alias=True)


@app.get("/api/runs/{run_id}/events")
async def stream_run_events(run_id: str) -> StreamingResponse:
    return StreamingResponse(manager.stream_events(run_id), media_type="text/event-stream")


@app.get("/api/runs/{run_id}/report")
async def get_run_report(run_id: str) -> dict[str, object]:
    return manager.get_report(run_id)


@app.post("/api/batches")
async def create_batch(request: BatchCreateRequest) -> dict[str, object]:
    manifest = await manager.create_batch(request)
    return manifest.model_dump(by_alias=True)


@app.post("/api/agent/strategy")
async def plan_agent_strategy(request: AgentStrategyRequest) -> dict[str, object]:
    response = await generate_agent_strategy(settings, request)
    payload = response.model_dump(by_alias=True, mode="json")
    request_payload = payload.get("request")
    if isinstance(request_payload, dict):
        if "apiKey" in request_payload:
            request_payload["apiKey"] = bool(request.api_key)
        if "aiApiKey" in request_payload:
            request_payload["aiApiKey"] = bool(request.ai_api_key)
    return payload


@app.post("/api/agent/strategy/execute")
async def execute_agent_strategy(request: AgentExecuteRequest) -> dict[str, object]:
    manifest = await manager.create_batch(draft_to_batch_request(request))
    return manifest.model_dump(by_alias=True)


@app.get("/api/batches")
async def list_batches() -> list[dict[str, object]]:
    return manager.list_batches()


@app.get("/api/batches/{batch_id}")
async def get_batch(batch_id: str) -> dict[str, object]:
    return manager.get_batch(batch_id)


@app.post("/api/batches/{batch_id}/stop")
async def stop_batch(batch_id: str) -> dict[str, object]:
    runtime = await manager.stop_batch(batch_id)
    return runtime.model_dump(by_alias=True)


@app.get("/api/batches/{batch_id}/report")
async def get_batch_report(batch_id: str) -> dict[str, object]:
    return manager.get_batch_report(batch_id)


@app.get("/api/history")
async def get_history() -> list[dict[str, object]]:
    return [item.model_dump(by_alias=True) for item in manager.list_history()]


@app.post("/api/ai/analyze")
async def ai_analyze(request: AIAnalyzeRequest) -> StreamingResponse:
    context = manager.get_ai_context(request.run_id)
    report_payload = context.get("report")
    report = RunReport.model_validate(report_payload) if isinstance(report_payload, dict) else None
    return StreamingResponse(
        stream_ai_analysis(settings, request, report, context),
        media_type="text/event-stream",
    )


@app.post("/api/ai/test")
async def ai_test(request: AITestRequest) -> dict[str, object]:
    return await test_ai_connection(settings, request)


if settings.frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(settings.frontend_dist), html=True), name="pulsebench-static")
else:
    @app.get("/")
    async def fallback_root() -> JSONResponse:
        return JSONResponse({"name": settings.app_name, "message": "Frontend dist not built yet."})
