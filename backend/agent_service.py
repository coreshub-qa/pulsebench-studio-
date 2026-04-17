from __future__ import annotations

import json
import logging
import re
from textwrap import dedent
from typing import Any

import httpx
from fastapi import HTTPException

from config import Settings
from schemas import (
    AgentConfidence,
    AgentExecuteRequest,
    AgentGoal,
    AgentGuardrails,
    AgentStrategyDraft,
    AgentStrategyRequest,
    AgentStrategyResponse,
    AgentStrategyRun,
    BatchCreateRequest,
    BatchRunConfig,
    RunSpec,
)


logger = logging.getLogger("pulsebench.agent")


GOAL_TEMPLATE_BASIS: dict[AgentGoal, str] = {
    "health_check": "quick_check",
    "interactive_experience": "short_text_experience",
    "balanced_throughput": "balanced_throughput",
    "long_context": "long_context_capability",
    "capacity_limit": "capacity_pressure",
}

GOAL_LABELS: dict[AgentGoal, str] = {
    "health_check": "首轮验活",
    "interactive_experience": "交互体验",
    "balanced_throughput": "均衡吞吐",
    "long_context": "长上下文",
    "capacity_limit": "容量压测",
}

GOAL_FOCUS_METRICS: dict[AgentGoal, list[str]] = {
    "health_check": ["ttft_p50", "ttft_p99", "success_rate", "output_tps"],
    "interactive_experience": ["ttft_p50", "ttft_p99", "latency_avg", "success_rate"],
    "balanced_throughput": ["output_tps", "total_tps", "latency_avg", "success_rate"],
    "long_context": ["ttft_p50", "ttft_p99", "latency_avg", "success_rate"],
    "capacity_limit": ["success_rate", "output_tps", "ttft_p99", "latency_p99"],
}

BUILTIN_DATASET_FILES = {
    "openqa": "quickcheck_openqa.jsonl",
    "longalpaca": "quickcheck_longalpaca.json",
}

SYSTEM_PROMPT = dedent(
    """
    你是 LLM 推理服务性能测试策略规划器。

    任务目标：
    1. 基于用户输入、系统 guardrails 和基础草案，输出一份更合理的测试策略。
    2. 你只能调整测试矩阵、标题、总结、假设、风险和说明，不能改写真实连接信息。
    3. 你必须保守处理不确定性。信息不足时，不要编造硬件能力或模型上限。
    4. 你必须输出严格 JSON，不要输出 Markdown，不要加代码块。
    5. 你输出的 runs 中，每一项 spec 必须包含：
       - dataset
       - minPromptLength
       - maxPromptLength
       - minTokens
       - maxTokens
       - parallel
       - number
    6. parallel 和 number 的长度必须一致，所有数值必须大于 0。
    7. 不要把并发设计得明显激进到脱离 guardrails。

    输出字段要求：
    {
      "title": string,
      "summary": string,
      "strategyType": string,
      "confidence": "low" | "medium" | "high",
      "assumptions": string[],
      "warnings": string[],
      "focusMetrics": string[],
      "runs": [
        {
          "label": string,
          "objective": string,
          "reasoning": string,
          "spec": {
            "dataset": string,
            "datasetPath": string | null,
            "minPromptLength": number,
            "maxPromptLength": number,
            "minTokens": number,
            "maxTokens": number,
            "parallel": number[],
            "number": number[]
          }
        }
      ]
    }
    """
).strip()


def _normalize_secret(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _resolve_ai_config(settings: Settings, request: AgentStrategyRequest) -> tuple[str | None, str | None, str | None]:
    return (
        _normalize_secret(request.ai_base_url or settings.ai_base_url),
        _normalize_secret(request.ai_api_key or settings.ai_api_key),
        _normalize_secret(request.ai_model or settings.ai_model),
    )


def _chat_endpoint(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _extract_response_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            return "".join(parts)
    return ""


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", stripped)
        stripped = re.sub(r"\n?```$", "", stripped)
    return stripped.strip()


def _parse_scale_billions(value: str | None) -> float | None:
    if not value:
        return None
    matched = re.search(r"(\d+(?:\.\d+)?)", value)
    if not matched:
        return None
    number = float(matched.group(1))
    lowered = value.lower()
    if "m" in lowered and "b" not in lowered:
        return number / 1000
    return number


def _round_positive(value: float, minimum: int = 1) -> int:
    return max(minimum, int(round(value)))


def _scale_ladder(points: list[int], factor: float) -> list[int]:
    scaled: list[int] = []
    for point in points:
        candidate = _round_positive(point * factor)
        if not scaled or candidate > scaled[-1]:
            scaled.append(candidate)
    if not scaled:
        return [1]
    return scaled


def _coerce_sorted_positive_list(value: Any) -> list[int]:
    if not isinstance(value, list):
        return []
    numbers: list[int] = []
    for item in value:
        if isinstance(item, bool):
            continue
        if isinstance(item, (int, float)):
            candidate = int(item)
            if candidate > 0:
                numbers.append(candidate)
    numbers = sorted(set(numbers))
    return numbers


def _coerce_str_list(value: Any, fallback: list[str]) -> list[str]:
    if not isinstance(value, list):
        return list(fallback)
    items = [str(item) for item in value if isinstance(item, str) and item.strip()]
    return items or list(fallback)


def _cap_length(value: int, *, minimum: int = 1, maximum: int | None = None) -> int:
    bounded = max(minimum, int(value))
    if maximum is not None:
        bounded = min(bounded, maximum)
    return bounded


def _builtin_dataset_path(settings: Settings, dataset: str) -> str | None:
    filename = BUILTIN_DATASET_FILES.get(dataset)
    if not filename:
        return None
    return str((settings.builtin_datasets_dir / filename).resolve())


def _default_lengths(request: AgentStrategyRequest) -> tuple[int, int]:
    prompt_defaults = {
        "health_check": 256,
        "interactive_experience": 2048,
        "balanced_throughput": 4096,
        "long_context": 32768,
        "capacity_limit": 4096,
    }
    output_defaults = {
        "health_check": 1024,
        "interactive_experience": 2048,
        "balanced_throughput": 4096,
        "long_context": 4096,
        "capacity_limit": 4096,
    }
    workload_prompt = {
        "chat_short": 1024,
        "chat_long_output": 2048,
        "rag_medium_context": 8192,
        "long_context_analysis": 32768,
        "code_generation": 4096,
        "unknown": prompt_defaults[request.goal],
    }
    workload_output = {
        "chat_short": 1024,
        "chat_long_output": 4096,
        "rag_medium_context": 2048,
        "long_context_analysis": 4096,
        "code_generation": 4096,
        "unknown": output_defaults[request.goal],
    }
    prompt = request.typical_prompt_length or workload_prompt[request.workload_type]
    output = request.typical_output_length or workload_output[request.workload_type]
    context_cap = request.context_window
    if context_cap:
        safe_cap = max(1024, int(context_cap * 0.7))
        prompt = min(prompt, safe_cap)
        output = min(output, max(1024, context_cap - prompt))
    return max(prompt, 1), max(output, 1)


def _preferred_dataset(request: AgentStrategyRequest, prompt_length: int) -> tuple[str, list[str], list[str]]:
    notes: list[str] = []
    if request.tokenizer_path:
        return "random", ["random", "openqa", "longalpaca"], notes
    if request.goal == "health_check":
        notes.append("未提供 tokenizerPath，已自动退回内置数据集，首轮更适合做服务验活而非严格长度控制。")
        return "openqa", ["openqa", "longalpaca"], notes
    if request.goal == "long_context" or prompt_length >= 4096:
        notes.append("未提供 tokenizerPath，已优先使用 longalpaca 作为长文本近似负载。")
        return "longalpaca", ["longalpaca", "openqa"], notes
    notes.append("未提供 tokenizerPath，已优先使用 openqa 作为保守负载。")
    return "openqa", ["openqa", "longalpaca"], notes


def _recommend_concurrency(request: AgentStrategyRequest, prompt_length: int, output_length: int) -> list[int]:
    base_points: dict[AgentGoal, list[int]] = {
        "health_check": [1, 2, 4],
        "interactive_experience": [1, 2, 4, 8],
        "balanced_throughput": [2, 4, 8, 16],
        "long_context": [1, 2, 4],
        "capacity_limit": [4, 8, 16, 32, 64],
    }
    factor = 1.0
    scale_b = _parse_scale_billions(request.parameter_scale)
    if scale_b is not None:
        if scale_b >= 70:
            factor *= 0.55
        elif scale_b >= 30:
            factor *= 0.75
        elif scale_b >= 10:
            factor *= 0.9
    if request.gpu_count:
        if request.gpu_count >= 8:
            factor *= 1.9
        elif request.gpu_count >= 4:
            factor *= 1.45
        elif request.gpu_count >= 2:
            factor *= 1.2
    if request.gpu_memory_gb:
        if request.gpu_memory_gb >= 80:
            factor *= 1.2
        elif request.gpu_memory_gb <= 24:
            factor *= 0.8
    if request.quantization and any(token in request.quantization.lower() for token in ("int4", "awq", "gptq", "fp8")):
        factor *= 1.15
    if prompt_length >= 131072:
        factor *= 0.25
    elif prompt_length >= 32768:
        factor *= 0.45
    elif prompt_length >= 8192:
        factor *= 0.75
    if output_length >= 16384:
        factor *= 0.8
    if request.aggressiveness == "conservative":
        factor *= 0.75
    elif request.aggressiveness == "aggressive":
        factor *= 1.35
    return _scale_ladder(base_points[request.goal], factor)


def _request_counts(goal: AgentGoal, parallel: list[int]) -> list[int]:
    multipliers = {
        "health_check": 6,
        "interactive_experience": 8,
        "balanced_throughput": 10,
        "long_context": 2,
        "capacity_limit": 12,
    }
    minimums = {
        "health_check": 6,
        "interactive_experience": 10,
        "balanced_throughput": 20,
        "long_context": 2,
        "capacity_limit": 24,
    }
    return [max(minimums[goal], point * multipliers[goal]) for point in parallel]


def build_agent_guardrails(request: AgentStrategyRequest) -> AgentGuardrails:
    prompt_length, output_length = _default_lengths(request)
    preferred_dataset, dataset_candidates, dataset_notes = _preferred_dataset(request, prompt_length)
    recommended_concurrency = _recommend_concurrency(request, prompt_length, output_length)
    assumptions: list[str] = []
    if request.context_window is None:
        assumptions.append("未提供上下文窗口，长度相关建议按保守上限估算。")
    if request.gpu_model is None and request.gpu_count is None:
        assumptions.append("未提供硬件信息，并发建议按中性硬件层级估算。")
    if request.typical_prompt_length is None or request.typical_output_length is None:
        assumptions.append("未提供完整负载画像，输入输出长度基于目标和 workloadType 采用默认值。")
    prompt_max = prompt_length
    token_max = output_length
    if request.context_window:
        prompt_max = min(prompt_max, max(1024, int(request.context_window * 0.8)))
        token_max = min(token_max, max(1024, request.context_window - min(prompt_max, request.context_window // 2)))
    notes = dataset_notes
    if request.goal == "capacity_limit":
        notes.append("容量压测阶段建议先看 successRate 与尾延迟，再决定是否继续冲顶。")
    if request.goal == "long_context":
        notes.append("长上下文场景优先保证稳定性和 TTFT，不建议一开始直接拉高并发。")
    return AgentGuardrails(
        templateBasis=GOAL_TEMPLATE_BASIS[request.goal],
        preferredDataset=preferred_dataset,
        datasetCandidates=dataset_candidates,
        focusMetrics=GOAL_FOCUS_METRICS[request.goal],
        recommendedConcurrency=recommended_concurrency,
        promptRange={"min": max(1, int(prompt_max * 0.8)), "max": prompt_max},
        tokenRange={"min": max(1, int(token_max * 0.8)), "max": token_max},
        requiresTokenizer=preferred_dataset == "random",
        assumptions=assumptions,
        notes=notes,
    )


def _build_spec(
    settings: Settings,
    request: AgentStrategyRequest,
    *,
    dataset: str,
    prompt_length: int,
    output_length: int,
    parallel: list[int],
    number: list[int],
) -> RunSpec:
    dataset_path = _builtin_dataset_path(settings, dataset)
    tokenizer_path = request.tokenizer_path if dataset == "random" else None
    if dataset == "random" and not tokenizer_path:
        raise HTTPException(status_code=422, detail="random 数据集模式需要 tokenizerPath。")
    return RunSpec(
        model=request.model,
        url=request.url,
        apiKey=request.api_key,
        parallel=parallel,
        number=number,
        dataset=dataset,
        tokenizerPath=tokenizer_path,
        datasetPath=dataset_path,
        minPromptLength=prompt_length,
        maxPromptLength=prompt_length,
        minTokens=output_length,
        maxTokens=output_length,
        extraArgs={"stream": bool(request.stream if request.stream is not None else True), "temperature": 0.0},
        aiEnabled=True,
    )


def _build_base_runs(settings: Settings, request: AgentStrategyRequest, guardrails: AgentGuardrails) -> list[AgentStrategyRun]:
    prompt_mid = guardrails.prompt_range["max"]
    token_mid = guardrails.token_range["max"]
    short_prompt = min(prompt_mid, 2048)
    short_output = min(token_mid, 2048)
    long_prompt = min(prompt_mid, request.context_window or prompt_mid)
    dataset = guardrails.preferred_dataset
    runs: list[AgentStrategyRun] = []

    if request.goal == "health_check":
        runs.append(
            AgentStrategyRun(
                label="短请求验活",
                objective="先确认服务在低并发短请求下可用，并快速观察首 Token 体验。",
                reasoning="先用低成本场景验证可用性，避免一开始就把排查范围拉大。",
                spec=_build_spec(
                    settings,
                    request,
                    dataset="openqa",
                    prompt_length=min(short_prompt, 256),
                    output_length=min(short_output, 1024),
                    parallel=[1, 2, 4],
                    number=[8, 12, 24],
                ),
            )
        )
        runs.append(
            AgentStrategyRun(
                label="均衡负载摸底",
                objective="观察中等输入输出和中低并发下的吞吐与平均延迟。",
                reasoning="如果基础验活通过，再用一组更接近真实使用的负载判断是否值得继续深入测。",
                spec=_build_spec(
                    settings,
                    request,
                    dataset="longalpaca" if dataset != "random" else dataset,
                    prompt_length=max(2048, min(prompt_mid, 8192)),
                    output_length=max(1024, min(token_mid, 4096)),
                    parallel=guardrails.recommended_concurrency[:3],
                    number=_request_counts("health_check", guardrails.recommended_concurrency[:3]),
                ),
            )
        )
        if prompt_mid >= 4096:
            runs.append(
                AgentStrategyRun(
                    label="长文本边界探测",
                    objective="在不扩大实验面的前提下，验证较长输入是否立即触发明显退化。",
                    reasoning="只追加一组低并发长文本验证，帮助判断下一轮是否需要切到长上下文专项。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset="longalpaca",
                        prompt_length=max(4096, min(prompt_mid, 12288)),
                        output_length=max(1024, min(token_mid, 4096)),
                        parallel=[1, 2],
                        number=[3, 6],
                    ),
                )
            )
    elif request.goal == "interactive_experience":
        runs.extend(
            [
                AgentStrategyRun(
                    label="短对话体验",
                    objective="关注短输入短输出下的 TTFT、平均延迟和成功率。",
                    reasoning="这组最接近日常助手和客服问答的首屏体验。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset,
                        prompt_length=short_prompt,
                        output_length=short_output,
                        parallel=guardrails.recommended_concurrency[:4],
                        number=_request_counts("interactive_experience", guardrails.recommended_concurrency[:4]),
                    ),
                ),
                AgentStrategyRun(
                    label="短入长出体验",
                    objective="观察短输入长输出时的等待感和生成阶段稳定性。",
                    reasoning="这组更容易暴露输出阶段瓶颈，适合判断生成阶段算力是否紧张。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset,
                        prompt_length=short_prompt,
                        output_length=max(2048, token_mid),
                        parallel=guardrails.recommended_concurrency[:4],
                        number=_request_counts("interactive_experience", guardrails.recommended_concurrency[:4]),
                    ),
                ),
                AgentStrategyRun(
                    label="中等上下文体验",
                    objective="验证更长输入下首 Token 等待时间是否仍可接受。",
                    reasoning="这组帮助确认真实业务稍长 prompt 是否会让交互体验明显变差。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset if dataset != "openqa" else "longalpaca",
                        prompt_length=max(2048, min(prompt_mid, 8192)),
                        output_length=short_output,
                        parallel=guardrails.recommended_concurrency[:3],
                        number=_request_counts("interactive_experience", guardrails.recommended_concurrency[:3]),
                    ),
                ),
            ]
        )
    elif request.goal == "balanced_throughput":
        runs.extend(
            [
                AgentStrategyRun(
                    label="典型稳态负载",
                    objective="在典型输入输出下寻找吞吐和延迟的平衡点。",
                    reasoning="先用最像生产流量的一组矩阵建立基线，再决定是否继续冲顶。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset,
                        prompt_length=max(2048, min(prompt_mid, 4096)),
                        output_length=max(2048, min(token_mid, 4096)),
                        parallel=guardrails.recommended_concurrency[:4],
                        number=_request_counts("balanced_throughput", guardrails.recommended_concurrency[:4]),
                    ),
                ),
                AgentStrategyRun(
                    label="输出主导吞吐",
                    objective="验证输出阶段更重时的吞吐上限和延迟代价。",
                    reasoning="把输出长度拉高，能更快识别生成阶段是否是主要瓶颈。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset,
                        prompt_length=short_prompt,
                        output_length=max(4096, token_mid),
                        parallel=guardrails.recommended_concurrency[-4:],
                        number=_request_counts("balanced_throughput", guardrails.recommended_concurrency[-4:]),
                    ),
                ),
            ]
        )
    elif request.goal == "long_context":
        long_points = guardrails.recommended_concurrency[:3]
        near_limit = max(long_prompt, int((request.context_window or long_prompt) * 0.75))
        runs.append(
            AgentStrategyRun(
                label="长输入基线",
                objective="先验证长输入下的 TTFT、稳定性和成功率。",
                reasoning="长上下文应先确认能否稳定完成，再考虑更极限的输入长度。",
                spec=_build_spec(
                    settings,
                    request,
                    dataset="longalpaca" if dataset != "random" else dataset,
                    prompt_length=long_prompt,
                    output_length=max(2048, min(token_mid, 4096)),
                    parallel=long_points,
                    number=_request_counts("long_context", long_points),
                ),
            )
        )
        if request.context_window and request.context_window >= 65536:
            runs.append(
                AgentStrategyRun(
                    label="接近上限验证",
                    objective="接近上下文上限时确认 TTFT 和成功率是否明显恶化。",
                    reasoning="这组用于判断模型/服务对接近上限输入的容忍度。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset="longalpaca" if dataset != "random" else dataset,
                        prompt_length=min(near_limit, int(request.context_window * 0.85)),
                        output_length=max(2048, min(token_mid, 4096)),
                        parallel=[1, 2],
                        number=[2, 4],
                    ),
                )
            )
        if request.aggressiveness == "aggressive":
            runs.append(
                AgentStrategyRun(
                    label="长入长出压力点",
                    objective="在保守并发下观察长输入长输出场景的极限行为。",
                    reasoning="只在激进模式下追加，避免首轮实验过大。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset="longalpaca" if dataset != "random" else dataset,
                        prompt_length=long_prompt,
                        output_length=max(token_mid, 8192),
                        parallel=[1, 2],
                        number=[2, 4],
                    ),
                )
            )
    else:
        runs.extend(
            [
                AgentStrategyRun(
                    label="标准负载冲顶",
                    objective="寻找典型负载下的最大稳定并发区间。",
                    reasoning="先用标准负载冲顶，最容易得到有决策价值的容量边界。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset,
                        prompt_length=max(2048, min(prompt_mid, 4096)),
                        output_length=max(2048, min(token_mid, 4096)),
                        parallel=guardrails.recommended_concurrency,
                        number=_request_counts("capacity_limit", guardrails.recommended_concurrency),
                    ),
                ),
                AgentStrategyRun(
                    label="输出主导冲顶",
                    objective="确认短输入长输出时的系统并发上限。",
                    reasoning="如果输出阶段更重，这组通常更快暴露生成瓶颈和尾延迟风险。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset=dataset,
                        prompt_length=short_prompt,
                        output_length=max(4096, token_mid),
                        parallel=guardrails.recommended_concurrency,
                        number=_request_counts("capacity_limit", guardrails.recommended_concurrency),
                    ),
                ),
            ]
        )
        if prompt_mid >= 8192:
            reduced_parallel = guardrails.recommended_concurrency[: max(2, min(4, len(guardrails.recommended_concurrency)))]
            runs.append(
                AgentStrategyRun(
                    label="长输入容量边界",
                    objective="确认更长输入下的容量边界是否明显提前到来。",
                    reasoning="长输入通常会改变瓶颈位置，需要一组更保守的并发点单独验证。",
                    spec=_build_spec(
                        settings,
                        request,
                        dataset="longalpaca" if dataset != "random" else dataset,
                        prompt_length=max(8192, min(prompt_mid, 32768)),
                        output_length=max(2048, min(token_mid, 4096)),
                        parallel=reduced_parallel,
                        number=_request_counts("long_context", reduced_parallel),
                    ),
                )
            )

    return runs


def _deterministic_confidence(request: AgentStrategyRequest, ai_used: bool) -> AgentConfidence:
    score = 0
    if request.context_window:
        score += 1
    if request.gpu_model or request.gpu_count:
        score += 1
    if request.tokenizer_path:
        score += 1
    if request.typical_prompt_length and request.typical_output_length:
        score += 1
    if request.engine or request.quantization:
        score += 1
    if ai_used:
        score += 1
    if request.goal == "long_context" and not request.context_window:
        score = max(0, score - 1)
    if score >= 5:
        return "high"
    if score >= 3:
        return "medium"
    return "low"


def build_base_draft(settings: Settings, request: AgentStrategyRequest, guardrails: AgentGuardrails) -> AgentStrategyDraft:
    runs = _build_base_runs(settings, request, guardrails)
    assumptions = list(guardrails.assumptions)
    warnings = list(guardrails.notes)
    if guardrails.requires_tokenizer and not request.tokenizer_path:
        warnings.append("当前目标更适合 random 数据集，但由于缺少 tokenizerPath，已退回内置数据集近似负载。")
    if request.goal == "capacity_limit":
        summary = "本策略先用一组标准冲顶矩阵建立容量边界，再用更偏输出或更长输入的负载验证瓶颈位置。"
    elif request.goal == "long_context":
        summary = "本策略优先确认长输入条件下的 TTFT 与稳定性，再视上下文窗口决定是否接近上限验证。"
    elif request.goal == "interactive_experience":
        summary = "本策略围绕真实交互体验设计，先看短对话，再看长输出和中等上下文带来的等待感变化。"
    elif request.goal == "balanced_throughput":
        summary = "本策略以典型生产负载为基线，先找吞吐与延迟的平衡点，再验证输出主导场景。"
    else:
        summary = "本策略先低成本确认服务可用，再追加一组更接近真实负载的矩阵，帮助决定是否继续深入。"
    return AgentStrategyDraft(
        templateId="agent_generated",
        mode="agent",
        title=f"{request.model} · {GOAL_LABELS[request.goal]}策略",
        summary=summary,
        strategyType=GOAL_LABELS[request.goal],
        confidence=_deterministic_confidence(request, ai_used=False),
        assumptions=assumptions,
        warnings=warnings,
        focusMetrics=guardrails.focus_metrics,
        runs=runs,
    )


def _sanitize_request_for_model(request: AgentStrategyRequest) -> dict[str, Any]:
    payload = request.model_dump(by_alias=True, exclude={"api_key", "ai_api_key"})
    payload["apiKey"] = bool(request.api_key)
    return payload


def _sanitize_draft_for_model(draft: AgentStrategyDraft) -> dict[str, Any]:
    payload = draft.model_dump(by_alias=True)
    for item in payload.get("runs", []):
        spec = item.get("spec")
        if isinstance(spec, dict):
            spec["apiKey"] = bool(spec.get("apiKey"))
    return payload


async def _refine_draft_with_ai(
    settings: Settings,
    request: AgentStrategyRequest,
    guardrails: AgentGuardrails,
    base_draft: AgentStrategyDraft,
) -> dict[str, Any] | None:
    base_url, api_key, model = _resolve_ai_config(settings, request)
    if not (base_url and api_key and model):
        return None
    payload = {
        "model": model,
        "stream": False,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "request": _sanitize_request_for_model(request),
                        "guardrails": guardrails.model_dump(by_alias=True),
                        "baseDraft": _sanitize_draft_for_model(base_draft),
                        "question": request.question,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    endpoint = _chat_endpoint(base_url)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=60.0)) as client:
            response = await client.post(endpoint, headers=headers, json=payload)
    except httpx.TimeoutException as exc:
        logger.warning("Agent planner timeout: model=%s endpoint=%s error=%s", model, endpoint, exc)
        raise HTTPException(status_code=504, detail=f"AI 规划请求超时: {exc}") from exc
    except httpx.HTTPError as exc:
        logger.warning("Agent planner request failed: model=%s endpoint=%s error=%s", model, endpoint, exc)
        raise HTTPException(status_code=502, detail=f"AI 规划请求失败: {exc}") from exc
    if response.is_error:
        detail = response.text.strip()
        if len(detail) > 280:
            detail = detail[:280] + "..."
        logger.warning("Agent planner upstream error: model=%s status=%s detail=%s", model, response.status_code, detail)
        raise HTTPException(status_code=502, detail=f"AI 规划请求失败，HTTP {response.status_code}。{detail or '未返回详细错误信息。'}")
    try:
        body = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=f"AI 规划响应无法解析为 JSON: {exc}") from exc
    content = _extract_response_text(body)
    if not content:
        raise HTTPException(status_code=502, detail="AI 已连通，但没有返回策略正文。")
    stripped = _strip_code_fences(content)
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"AI 返回的策略 JSON 不合法: {exc}") from exc
    if isinstance(parsed, dict) and isinstance(parsed.get("draft"), dict):
        return parsed["draft"]
    if isinstance(parsed, dict):
        return parsed
    raise HTTPException(status_code=502, detail="AI 返回的策略结构不正确。")


def _hydrate_run_spec(
    settings: Settings,
    request: AgentStrategyRequest,
    guardrails: AgentGuardrails,
    spec_payload: dict[str, Any],
    fallback: RunSpec,
) -> RunSpec:
    dataset = spec_payload.get("dataset") or fallback.dataset or guardrails.preferred_dataset
    if dataset == "random" and not request.tokenizer_path:
        dataset = guardrails.preferred_dataset
    tokenizer_path = request.tokenizer_path if dataset == "random" else None
    dataset_path = spec_payload.get("datasetPath")
    if dataset_path in {"", None}:
        dataset_path = fallback.dataset_path or _builtin_dataset_path(settings, dataset)
    prompt_min = _cap_length(spec_payload.get("minPromptLength", fallback.min_prompt_length or guardrails.prompt_range["min"]), maximum=guardrails.prompt_range["max"])
    prompt_max = _cap_length(spec_payload.get("maxPromptLength", fallback.max_prompt_length or guardrails.prompt_range["max"]), minimum=prompt_min, maximum=guardrails.prompt_range["max"])
    token_min = _cap_length(spec_payload.get("minTokens", fallback.min_tokens or guardrails.token_range["min"]), maximum=guardrails.token_range["max"])
    token_max = _cap_length(spec_payload.get("maxTokens", fallback.max_tokens or guardrails.token_range["max"]), minimum=token_min, maximum=guardrails.token_range["max"])
    parallel = _coerce_sorted_positive_list(spec_payload.get("parallel")) or list(fallback.parallel)
    number = _coerce_sorted_positive_list(spec_payload.get("number")) or list(fallback.number)
    if len(parallel) != len(number):
        parallel = list(fallback.parallel)
        number = list(fallback.number)
    return RunSpec(
        title=fallback.title,
        model=request.model,
        url=request.url,
        apiKey=request.api_key,
        parallel=parallel,
        number=number,
        dataset=dataset,
        tokenizerPath=tokenizer_path,
        datasetPath=dataset_path,
        minPromptLength=prompt_min,
        maxPromptLength=prompt_max,
        minTokens=token_min,
        maxTokens=token_max,
        extraArgs=fallback.extra_args,
        aiEnabled=True,
    )


def _coerce_ai_draft(
    settings: Settings,
    request: AgentStrategyRequest,
    guardrails: AgentGuardrails,
    payload: dict[str, Any],
    fallback: AgentStrategyDraft,
) -> AgentStrategyDraft:
    raw_runs = payload.get("runs")
    if not isinstance(raw_runs, list) or not raw_runs:
        raise HTTPException(status_code=502, detail="AI 返回的策略缺少 runs。")
    hydrated_runs: list[AgentStrategyRun] = []
    fallback_runs = fallback.runs
    for index, item in enumerate(raw_runs):
        if not isinstance(item, dict):
            continue
        fallback_run = fallback_runs[min(index, len(fallback_runs) - 1)]
        spec_payload = item.get("spec") if isinstance(item.get("spec"), dict) else {}
        hydrated_runs.append(
            AgentStrategyRun(
                label=str(item.get("label") or fallback_run.label),
                objective=str(item.get("objective") or fallback_run.objective),
                reasoning=str(item.get("reasoning") or fallback_run.reasoning),
                spec=_hydrate_run_spec(settings, request, guardrails, spec_payload, fallback_run.spec),
            )
        )
    if not hydrated_runs:
        raise HTTPException(status_code=502, detail="AI 返回的策略 runs 为空。")
    confidence = payload.get("confidence")
    if confidence not in {"low", "medium", "high"}:
        confidence = _deterministic_confidence(request, ai_used=True)
    return AgentStrategyDraft(
        templateId="agent_generated",
        mode="agent",
        title=str(payload.get("title") or fallback.title),
        summary=str(payload.get("summary") or fallback.summary),
        strategyType=str(payload.get("strategyType") or fallback.strategy_type),
        confidence=confidence,
        assumptions=_coerce_str_list(payload.get("assumptions"), fallback.assumptions),
        warnings=_coerce_str_list(payload.get("warnings"), fallback.warnings),
        focusMetrics=_coerce_str_list(payload.get("focusMetrics"), fallback.focus_metrics),
        runs=hydrated_runs,
    )


async def generate_agent_strategy(settings: Settings, request: AgentStrategyRequest) -> AgentStrategyResponse:
    guardrails = build_agent_guardrails(request)
    base_draft = build_base_draft(settings, request, guardrails)
    draft = base_draft
    base_url, api_key, model = _resolve_ai_config(settings, request)
    if not (base_url and api_key and model):
        fallback_warnings = list(base_draft.warnings)
        fallback_warnings.append("未配置 Agent 规划 AI，当前结果来自规则生成草案。")
        draft = base_draft.model_copy(update={"warnings": fallback_warnings})
        return AgentStrategyResponse(request=request, guardrails=guardrails, draft=draft)
    try:
        ai_payload = await _refine_draft_with_ai(settings, request, guardrails, base_draft)
        if ai_payload is not None:
            draft = _coerce_ai_draft(settings, request, guardrails, ai_payload, base_draft)
            draft = draft.model_copy(update={"confidence": _deterministic_confidence(request, ai_used=True)})
    except HTTPException as exc:
        logger.warning("Agent planner fallback triggered: %s", exc.detail)
        fallback_warnings = list(base_draft.warnings)
        fallback_warnings.append(f"AI 规划不可用，已返回规则生成草案。原因: {exc.detail}")
        draft = base_draft.model_copy(
            update={
                "warnings": fallback_warnings,
                "confidence": _deterministic_confidence(request, ai_used=False),
            }
        )
    return AgentStrategyResponse(request=request, guardrails=guardrails, draft=draft)


def draft_to_batch_request(payload: AgentExecuteRequest) -> BatchCreateRequest:
    runs = [
        BatchRunConfig(
            label=item.label,
            objective=item.objective,
            spec=item.spec.model_copy(update={"title": f"{payload.draft.title} · {item.label}"}),
        )
        for item in payload.draft.runs
    ]
    return BatchCreateRequest(
        templateId=payload.draft.template_id,
        mode="agent",
        title=payload.draft.title,
        runs=runs,
    )
