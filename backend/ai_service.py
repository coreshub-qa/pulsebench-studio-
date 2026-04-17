from __future__ import annotations

import json
import logging
import time
from datetime import date, datetime
from textwrap import dedent
from typing import AsyncIterator

import httpx

from config import Settings
from schemas import AIAnalyzeRequest, AITestRequest, RunReport


logger = logging.getLogger("pulsebench.ai")


COMMON_SYSTEM_RULES = dedent(
    """
    你是资深推理性能分析专家，服务对象是做模型服务压测和容量规划的工程师。

    你的任务不是复述原始报告，而是做专业判断。请严格遵守以下规则：
    1. 全程使用中文，语气专业、明确、克制。
    2. 优先回答用户追问；如果 question 为空，则按当前分析模式输出。
    3. 只能基于传入的 report、runtime、spec、commandPreview、failureContext 作判断，不要编造不存在的指标、场景、阈值或实验结论。
    4. 先给结论，再给证据，再给建议。不要先堆背景介绍。
    5. 引用指标或错误证据时尽量写出具体字段名、并发点、退出码、报错片段和变化方向，例如 TTFT、TPOT、ITL、avgLatencySec、outputTokensPerSec、successRate、exitCode、runtimeMessage、errorEvents。
    6. 如果数据不足以支持强结论，必须明确指出“不足以判断”的原因，以及还缺什么数据。
    7. 不要输出空泛套话，例如“建议进一步优化”“需要综合考虑”。所有建议都要具体到下一步该怎么测、改什么参数、验证什么假设。
    8. 不要原样复述整段 JSON，不要输出代码块包裹原始 report 或整段原始日志。
    9. 默认使用 Markdown 输出，层级清楚，段落短，便于直接阅读。
    """
).strip()


SYSTEM_PROMPTS = {
    "overview": dedent(
        f"""
        {COMMON_SYSTEM_RULES}

        当前模式：整体诊断。
        你的核心目标是给出这次压测的总体判断，并帮助操作者快速决定“这个结果是否健康、哪里值得警惕、下一步该做什么”。

        输出结构必须严格使用以下 4 个部分：
        ## 总体判断
        用 2 至 4 句话回答：这次结果整体健康、一般还是存在明显风险；结论必须有方向性，不要模糊。

        ## 关键证据
        用 3 至 6 条要点列出最关键的证据。
        每条尽量包含：指标名、并发点或区间、变化趋势、它说明了什么。

        ## 风险与结论
        归纳当前最值得关注的 2 至 4 个风险或限制。
        如果没有明显风险，也要明确说明“当前未见明显异常”，并指出结论边界。

        ## 建议动作
        给出 2 至 4 条下一步动作。
        每条动作都要可执行，例如“把并发从 20 提到 50 验证吞吐是否继续线性增长”，不要写空话。
        """
    ).strip(),
    "bottleneck": dedent(
        f"""
        {COMMON_SYSTEM_RULES}

        当前模式：瓶颈判断。
        你的核心目标是识别性能瓶颈更像出现在首 Token 阶段、持续生成阶段、整体排队/调度阶段，还是系统稳定性阶段。

        分析时必须重点关注：
        1. TTFT、TPOT、ITL、avgLatencySec、outputTokensPerSec、successRate 的相互关系。
        2. 随并发升高时，哪些指标先恶化，哪些指标随后跟着恶化。
        3. 是否存在“吞吐上不去但延迟大幅上升”“成功率下滑导致表面吞吐失真”“长尾显著恶化”等现象。

        输出结构必须严格使用以下 4 个部分：
        ## 瓶颈结论
        直接判断当前更像是哪一类瓶颈主导，并给出一句结论。

        ## 证据链
        用 3 至 6 条要点说明为什么得出这个判断。
        每条要点必须尽量落到具体指标和趋势，避免泛泛表述。

        ## 可能原因
        给出 2 至 4 个最可能的技术原因。
        原因要和证据链对应，例如预填充压力、KV cache 压力、调度排队、生成阶段算力不足、服务限流或异常重试等。
        如果证据不足，请明确写“仅为假设”。

        ## 验证建议
        给出 2 至 4 个验证性实验。
        每个实验必须写清楚要改什么变量、预期观察哪个指标变化、如何判断假设是否成立。
        """
    ).strip(),
    "next_step": dedent(
        f"""
        {COMMON_SYSTEM_RULES}

        当前模式：下一轮建议。
        你的核心目标不是解释当前报告，而是帮助操作者设计下一轮最有信息增量的实验。

        设计建议时必须遵守：
        1. 优先提出能验证关键假设的实验，而不是机械地“把所有参数都再跑一遍”。
        2. 优先级从高到低排序，先给最值得做的动作。
        3. 每条建议都要明确：调整什么参数、预期观察什么指标、这条实验想回答什么问题。
        4. 如果当前数据已经足够支持某个结论，也可以建议“先不要扩大实验面”，而是转入某个更窄的验证。

        输出结构必须严格使用以下 3 个部分：
        ## 下一轮优先级
        先用一小段话说明下一轮最值得优先验证的方向是什么。

        ## 建议实验清单
        给出 3 条按优先级排序的实验建议，格式如下：
        1. 实验目标
        变更项：
        观察指标：
        预期结论：

        ## 执行顺序说明
        说明为什么要按这个顺序做，而不是同时展开所有实验。
        """
    ).strip(),
    "failure": dedent(
        f"""
        {COMMON_SYSTEM_RULES}

        当前模式：失败诊断。
        你的核心目标是基于 runtime、events、raw log 片段、命令预览和可能存在的 report，判断这次压测失败的直接原因、最可能的根因，以及最快的修复验证路径。

        分析时必须遵守：
        1. 优先找直接失败证据，例如退出码、runtimeMessage、errorEvents、rawLogSnippets 里的错误片段。
        2. 要区分“直接报错”与“更底层根因”，不要把两者混为一谈。
        3. 如果日志只能支持若干假设，必须明确标注“高/中/低置信度”，不要伪装成确定结论。
        4. 建议动作必须优先给最短闭环的排查路径，例如先验证模型名、鉴权、服务可达性、tokenizer 路径、数据集过滤条件、chat/completions 协议兼容性、evalscope 环境等。

        输出结构必须严格使用以下 5 个部分：
        ## 失败结论
        用 2 至 4 句话说明这次失败更像是哪一类问题主导，以及当前最值得优先验证的方向。

        ## 直接证据
        用 3 至 6 条要点列出直接支持结论的证据。
        可以引用很短的错误片段，但不要长段粘贴日志。

        ## 可能根因
        给出 2 至 4 条根因，按置信度排序。
        每条都要写清楚它和哪些证据对应，并标注高 / 中 / 低置信度。

        ## 处理建议
        给出 3 至 5 条可执行动作。
        每条动作都要具体到要检查什么、改什么、看什么结果算通过。

        ## 建议复测方式
        给出一条最小复测方案，说明下一次应该用什么最小参数先验证修复是否生效。
        """
    ).strip(),
}


def _sse(message: str) -> str:
    return f"data: {message}\n\n"


def _json_default(value: object) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def _normalize_secret(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _resolve_ai_config(settings: Settings, request: AIAnalyzeRequest | AITestRequest) -> tuple[str | None, str | None, str | None]:
    return (
        _normalize_secret(request.ai_base_url or settings.ai_base_url),
        _normalize_secret(request.ai_api_key or settings.ai_api_key),
        _normalize_secret(request.ai_model or settings.ai_model),
    )


def _chat_endpoint(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _extract_response_text(payload: dict[str, object]) -> str:
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
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str):
                        parts.append(text)
            return "".join(parts)
    return ""


async def test_ai_connection(settings: Settings, request: AITestRequest) -> dict[str, object]:
    base_url, api_key, model = _resolve_ai_config(settings, request)
    if not (base_url and api_key and model):
        return {
            "ok": False,
            "message": "AI 未配置完整。请填写 Base URL、API Key 和模型名称，或确保服务端环境变量已配置。",
            "model": model or "",
            "endpoint": base_url or "",
            "latencyMs": None,
            "responsePreview": None,
            "statusCode": None,
        }

    endpoint = _chat_endpoint(base_url)
    started = time.perf_counter()
    logger.info("AI test started: model=%s endpoint=%s", model, endpoint)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "stream": False,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": "你是连通性检测助手。请只回复 ok。"},
            {"role": "user", "content": "这是 PulseBench 的 AI 连通性测试。请只回复 ok。"},
        ],
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, read=20.0)) as client:
        try:
            response = await client.post(endpoint, headers=headers, json=payload)
            latency_ms = int((time.perf_counter() - started) * 1000)
            preview = None
            try:
                body = response.json()
                preview = _extract_response_text(body).strip() or None
            except ValueError:
                body = None

            if response.is_error:
                detail = response.text.strip()
                if len(detail) > 280:
                    detail = detail[:280] + "..."
                logger.warning(
                    "AI test failed: model=%s endpoint=%s status=%s detail=%s",
                    model,
                    endpoint,
                    response.status_code,
                    detail,
                )
                return {
                    "ok": False,
                    "message": f"AI 接口返回错误 HTTP {response.status_code}。{detail or '未返回详细错误信息。'}",
                    "model": model,
                    "endpoint": endpoint,
                    "latencyMs": latency_ms,
                    "responsePreview": preview,
                    "statusCode": response.status_code,
                }

            if not preview:
                logger.warning("AI test returned empty content: model=%s endpoint=%s", model, endpoint)
                return {
                    "ok": False,
                    "message": "接口已连通，但模型返回了空内容。请检查该模型是否兼容 chat/completions 协议。",
                    "model": model,
                    "endpoint": endpoint,
                    "latencyMs": latency_ms,
                    "responsePreview": None,
                    "statusCode": response.status_code,
                }

            logger.info("AI test succeeded: model=%s endpoint=%s latency_ms=%s", model, endpoint, latency_ms)
            return {
                "ok": True,
                "message": "AI 模型连接成功，可以用于分析。",
                "model": model,
                "endpoint": endpoint,
                "latencyMs": latency_ms,
                "responsePreview": preview[:120],
                "statusCode": response.status_code,
            }
        except httpx.HTTPError as exc:
            latency_ms = int((time.perf_counter() - started) * 1000)
            logger.exception("AI test request failed: model=%s endpoint=%s", model, endpoint)
            return {
                "ok": False,
                "message": f"AI 测试请求失败: {exc}",
                "model": model,
                "endpoint": endpoint,
                "latencyMs": latency_ms,
                "responsePreview": None,
                "statusCode": None,
            }


async def stream_ai_analysis(
    settings: Settings,
    request: AIAnalyzeRequest,
    report: RunReport | None,
    analysis_context: dict[str, object],
) -> AsyncIterator[str]:
    base_url, api_key, model = _resolve_ai_config(settings, request)

    if not (base_url and api_key and model):
        yield _sse(json.dumps({"type": "error", "message": "AI 未配置。请在分析面板中填写 Base URL、API Key 和模型名称，或通过环境变量 AI_BASE_URL / AI_API_KEY / AI_MODEL 配置。"}, ensure_ascii=False))
        return

    prompt = {
        "mode": request.mode,
        "question": request.question,
        "runtime": analysis_context.get("runtime"),
        "spec": analysis_context.get("spec"),
        "commandPreview": analysis_context.get("commandPreview"),
        "report": report.model_dump(by_alias=True) if report else None,
        "failureContext": analysis_context.get("failureContext"),
    }
    payload = {
        "model": model,
        "stream": True,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPTS[request.mode]},
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False, default=_json_default)},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    endpoint = _chat_endpoint(base_url)
    logger.info("AI analysis started: mode=%s model=%s endpoint=%s", request.mode, model, endpoint)
    received_text = False

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=120.0)) as client:
        try:
            async with client.stream(
                "POST",
                endpoint,
                headers=headers,
                json=payload,
            ) as response:
                if response.is_error:
                    detail = (await response.aread()).decode(errors="ignore").strip()
                    if len(detail) > 280:
                        detail = detail[:280] + "..."
                    logger.warning(
                        "AI analysis upstream error: mode=%s model=%s status=%s detail=%s",
                        request.mode,
                        model,
                        response.status_code,
                        detail,
                    )
                    yield _sse(json.dumps({"type": "error", "message": f"AI 请求失败，HTTP {response.status_code}。{detail or '未返回详细错误信息。'}"}, ensure_ascii=False))
                    return
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    if line.strip() == "data: [DONE]":
                        break
                    try:
                        chunk = json.loads(line[6:])
                    except json.JSONDecodeError:
                        continue
                    delta = ""
                    choices = chunk.get("choices") or []
                    if choices:
                        delta = choices[0].get("delta", {}).get("content", "")
                    if delta:
                        received_text = True
                        yield _sse(json.dumps({"type": "delta", "content": delta}, ensure_ascii=False))
        except httpx.HTTPError as exc:
            logger.exception("AI analysis request failed: mode=%s model=%s endpoint=%s", request.mode, model, endpoint)
            yield _sse(json.dumps({"type": "error", "message": f"AI 请求失败: {exc}"}, ensure_ascii=False))
            return

    if not received_text:
        logger.warning("AI analysis finished without text: mode=%s model=%s endpoint=%s", request.mode, model, endpoint)
        yield _sse(json.dumps({"type": "error", "message": "AI 已连通，但没有返回正文。请先用“测试连接”确认模型兼容，再检查该模型是否支持流式 chat/completions 输出。"}, ensure_ascii=False))
        return

    logger.info("AI analysis completed: mode=%s model=%s endpoint=%s", request.mode, model, endpoint)
    yield _sse(json.dumps({"type": "done"}, ensure_ascii=False))
