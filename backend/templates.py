from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any


TEMPLATES: list[dict[str, Any]] = [
    {
        "id": "quick_check",
        "name": "一键体检",
        "mode": "quick_check",
        "description": "用于首次摸底的轻量综合测试，默认不要求 tokenizer，改用内置数据集快速给出参考结论。",
        "dataset": "openqa",
        "requiresTokenizerPath": False,
        "focusMetrics": ["ttft_p50", "ttft_p99", "output_tps", "success_rate"],
        "defaultParams": {"stream": True, "temperature": 0.0, "aiEnabled": True},
        "matrix": [
            {
                "label": "短文本基线",
                "objective": "使用短问答数据快速观察单并发与低并发体验。",
                "dataset": "openqa",
                "datasetPath": "__BUILTIN__/quickcheck_openqa.jsonl",
                "minPromptLength": 0,
                "maxPromptLength": 256,
                "minTokens": 2048,
                "maxTokens": 2048,
                "parallel": [1, 5, 10],
                "number": [8, 20, 40],
            },
            {
                "label": "均衡吞吐",
                "objective": "使用长文本数据观察中等输入输出下的吞吐和延迟平衡。",
                "dataset": "longalpaca",
                "datasetPath": "__BUILTIN__/quickcheck_longalpaca.json",
                "minPromptLength": 4096,
                "maxPromptLength": 8192,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [2, 5, 10],
                "number": [6, 15, 30],
            },
            {
                "label": "长上下文探测",
                "objective": "使用长文本数据快速评估更长输入时的 TTFT 与稳定性。",
                "dataset": "longalpaca",
                "datasetPath": "__BUILTIN__/quickcheck_longalpaca.json",
                "minPromptLength": 6000,
                "maxPromptLength": 12000,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [1, 2, 4],
                "number": [3, 6, 12],
            },
        ],
        "reportPreset": "quick_check",
    },
    {
        "id": "short_text_experience",
        "name": "短文本体验",
        "mode": "template",
        "description": "聚焦首 Token 响应时间和常规对话体验，适合客服、助手、日常问答场景。",
        "dataset": "random",
        "requiresTokenizerPath": True,
        "focusMetrics": ["ttft_p50", "ttft_p99", "latency_avg", "success_rate"],
        "defaultParams": {"stream": True, "temperature": 0.0, "aiEnabled": True},
        "matrix": [
            {
                "label": "2K 入 2K 出",
                "objective": "观察最常见短对话场景的体验基线。",
                "minPromptLength": 2048,
                "maxPromptLength": 2048,
                "minTokens": 2048,
                "maxTokens": 2048,
                "parallel": [1, 5, 10, 20],
                "number": [12, 30, 60, 120],
            },
            {
                "label": "2K 入 4K 出",
                "objective": "观察短输入长输出时的生成速度与等待感。",
                "minPromptLength": 2048,
                "maxPromptLength": 2048,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [1, 5, 10, 20],
                "number": [10, 25, 50, 100],
            },
            {
                "label": "4K 入 2K 出",
                "objective": "观察更长输入但中等输出时的响应行为。",
                "minPromptLength": 4096,
                "maxPromptLength": 4096,
                "minTokens": 2048,
                "maxTokens": 2048,
                "parallel": [1, 5, 10, 20],
                "number": [10, 25, 50, 100],
            },
        ],
        "reportPreset": "experience",
    },
    {
        "id": "balanced_throughput",
        "name": "均衡吞吐",
        "mode": "template",
        "description": "聚焦常规生产负载下的吞吐与延迟平衡，适合做产线基线和容量预估。",
        "dataset": "random",
        "requiresTokenizerPath": True,
        "focusMetrics": ["output_tps", "total_tps", "latency_avg", "success_rate"],
        "defaultParams": {"stream": True, "temperature": 0.0, "aiEnabled": True},
        "matrix": [
            {
                "label": "4K 入 4K 出",
                "objective": "观察中等输入输出下的稳态吞吐。",
                "minPromptLength": 4096,
                "maxPromptLength": 4096,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [5, 10, 20, 40],
                "number": [20, 40, 80, 160],
            },
            {
                "label": "2K 入 4K 出",
                "objective": "观察生成占主导时的输出吞吐上限。",
                "minPromptLength": 2048,
                "maxPromptLength": 2048,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [10, 20, 40, 80],
                "number": [40, 80, 160, 320],
            },
        ],
        "reportPreset": "throughput",
    },
    {
        "id": "long_context_capability",
        "name": "长上下文能力",
        "mode": "template",
        "description": "聚焦长输入条件下的 TTFT、稳定性和上下文处理能力。",
        "dataset": "random",
        "requiresTokenizerPath": True,
        "focusMetrics": ["ttft_p50", "ttft_p99", "success_rate", "latency_avg"],
        "defaultParams": {"stream": True, "temperature": 0.0, "aiEnabled": True},
        "matrix": [
            {
                "label": "128K 入 4K 出",
                "objective": "评估长输入情况下的首 Token 等待时间。",
                "minPromptLength": 131072,
                "maxPromptLength": 131072,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [1, 2, 4],
                "number": [3, 6, 12],
            },
            {
                "label": "256K 入 4K 出",
                "objective": "接近上下文上限时的稳定性验证。",
                "minPromptLength": 262144,
                "maxPromptLength": 262144,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [1, 2, 4],
                "number": [2, 4, 8],
            },
            {
                "label": "128K 入 128K 出",
                "objective": "观察极限长上下文长输出场景。",
                "minPromptLength": 131072,
                "maxPromptLength": 131072,
                "minTokens": 131072,
                "maxTokens": 131072,
                "parallel": [1, 2],
                "number": [2, 4],
            },
        ],
        "reportPreset": "long_context",
    },
    {
        "id": "capacity_pressure",
        "name": "容量压测",
        "mode": "template",
        "description": "聚焦最大稳定并发区间和系统极限，适合容量规划与稳定性摸底。",
        "dataset": "random",
        "requiresTokenizerPath": True,
        "focusMetrics": ["success_rate", "output_tps", "ttft_p99", "latency_p99"],
        "defaultParams": {"stream": True, "temperature": 0.0, "aiEnabled": True},
        "matrix": [
            {
                "label": "4K 入 4K 出冲顶",
                "objective": "寻找标准负载下的最大稳定并发。",
                "minPromptLength": 4096,
                "maxPromptLength": 4096,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [20, 50, 100, 150, 200],
                "number": [80, 200, 400, 600, 800],
            },
            {
                "label": "2K 入 4K 出冲顶",
                "objective": "观察短输入下系统并发上限。",
                "minPromptLength": 2048,
                "maxPromptLength": 2048,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [50, 100, 200, 300],
                "number": [200, 400, 800, 1200],
            },
            {
                "label": "128K 入 4K 出冲顶",
                "objective": "观察长输入条件下的容量边界。",
                "minPromptLength": 131072,
                "maxPromptLength": 131072,
                "minTokens": 4096,
                "maxTokens": 4096,
                "parallel": [2, 4, 8, 12],
                "number": [8, 16, 32, 48],
            },
        ],
        "reportPreset": "capacity",
    },
]


def list_templates(builtin_datasets_dir: Path | None = None) -> list[dict[str, Any]]:
    templates = deepcopy(TEMPLATES)
    if builtin_datasets_dir is None:
        return templates

    marker = "__BUILTIN__/"
    for template in templates:
        for item in template.get("matrix", []):
            dataset_path = item.get("datasetPath")
            if isinstance(dataset_path, str) and dataset_path.startswith(marker):
                item["datasetPath"] = str((builtin_datasets_dir / dataset_path[len(marker) :]).resolve())
    return templates


def get_template(template_id: str) -> dict[str, Any]:
    for item in TEMPLATES:
        if item["id"] == template_id:
            return deepcopy(item)
    raise KeyError(template_id)
