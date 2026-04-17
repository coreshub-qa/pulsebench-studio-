from __future__ import annotations

import json
from pathlib import Path


OPENQA_FILE = "quickcheck_openqa.jsonl"
LONGALPACA_FILE = "quickcheck_longalpaca.json"


_SHORT_QUESTIONS = [
    "请用三句话解释什么是推理服务的首 Token 延迟。",
    "为什么并发上升时吞吐会增加，但延迟也可能明显变差？",
    "解释一下 TTFT、TPOT、ITL 三个指标分别代表什么。",
    "什么情况下更应该关注 P99，而不是平均延迟？",
    "如果模型输出速度很快，但首 Token 很慢，这通常意味着什么？",
    "为什么压测时要尽量避免同时运行多个任务？",
    "请概括推理服务压测报告中最值得先看的三个指标。",
    "在容量规划场景里，成功率下降说明了什么问题？",
    "为什么固定输入输出长度的基准测试更容易横向比较？",
    "长上下文压测时，首 Token 时间通常会受到哪些因素影响？",
    "如果输出吞吐高，但用户体验仍差，可能是什么原因？",
    "如何区分服务抖动和稳定的高延迟？",
    "请解释什么是稳定并发区间。",
    "为什么压测报告需要同时给出 P50、P90、P99？",
    "如果成功率是 100%，是否就意味着服务已经足够好？",
    "推理服务做快速体检时，为什么不一定需要完整业务数据集？",
    "什么样的测试更适合用真实业务样本，什么样的测试更适合用随机样本？",
    "当并发翻倍但总吞吐几乎不再上升时，这通常代表什么？",
    "为什么长输入场景下的 TTFT 会比短输入场景更敏感？",
    "如果模型表现出偶发超长尾延迟，报告里应该重点看哪些位置？",
    "请用简单语言解释吞吐、延迟和稳定性三者的关系。",
    "在快速验收阶段，一份压测报告最需要回答哪几个问题？",
    "服务地址正确但测试仍失败，除了网络问题还可能是什么原因？",
    "为什么同一模型在短文本和长文本场景下可能表现完全不同？",
]


def _build_openqa_rows() -> list[dict[str, str]]:
    return [{"question": question} for question in _SHORT_QUESTIONS]


def _build_long_instruction(topic: str, target_length: int) -> str:
    intro = (
        f"你是一名推理系统分析师。请围绕“{topic}”撰写一份结构化研究备忘录，"
        "要求覆盖背景、现状、问题拆解、风险、性能影响、实验方法、指标解释、结果解读与行动建议。"
        "文稿需要保持自然中文，不要只给提纲，而是输出完整展开的正文。"
    )
    fragments: list[str] = [intro]
    chapter = 1
    while len("".join(fragments)) < target_length:
        fragments.append(
            f"\n\n第{chapter}部分：请详细说明 {topic} 在真实线上系统中的表现差异，"
            "分别从请求形态、输入长度、输出长度、并发梯度、缓存命中、调度策略、错误恢复、观察指标、"
            "用户体验、容量规划、资源利用率、尾延迟来源等角度展开。"
            "这一部分还需要加入一个连续案例：假设团队在上午发布新模型，下午开始收到响应变慢的反馈，"
            "请按时间线复盘检测、定位、回滚、复测、复盘总结的全过程，并明确每一步应该记录哪些数据。"
            "随后继续补充一个对照案例：另一组服务在低并发下表现良好，但一旦进入长输入批量请求便出现首 Token 明显抖动，"
            "请比较这两类问题在指标面板上的不同特征，并说明为什么只看平均值会误判。"
            "最后，请再写出一段面向工程负责人和一段面向业务负责人的解释口径，"
            "要求二者关注点不同，但都能理解压测报告最终要回答的是哪里达到瓶颈、哪里仍有优化余地。"
        )
        chapter += 1
    return "".join(fragments)


def _build_longalpaca_rows() -> list[dict[str, str]]:
    topics = [
        ("推理服务容量规划", 4300),
        ("首 Token 延迟优化", 4800),
        ("长上下文稳定性排查", 5300),
        ("并发冲顶后的瓶颈识别", 5900),
        ("吞吐与延迟的权衡分析", 6500),
        ("模型上线后的压测复盘", 7200),
        ("大模型生产验收标准", 8100),
        ("长文本问答的性能诊断", 9000),
        ("推理服务日志与指标联动", 9800),
        ("高并发用户体验治理", 10800),
        ("多场景压测报告解读", 11600),
        ("推理系统容量边界实验", 12400),
    ]
    return [{"instruction": _build_long_instruction(topic, target)} for topic, target in topics]


def ensure_builtin_datasets(root: Path) -> dict[str, Path]:
    root.mkdir(parents=True, exist_ok=True)

    openqa_path = root / OPENQA_FILE
    if not openqa_path.exists():
        rows = _build_openqa_rows()
        content = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n"
        openqa_path.write_text(content, encoding="utf-8")

    longalpaca_path = root / LONGALPACA_FILE
    if not longalpaca_path.exists():
        longalpaca_path.write_text(
            json.dumps(_build_longalpaca_rows(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return {
        "quickcheck_openqa": openqa_path,
        "quickcheck_longalpaca": longalpaca_path,
    }
