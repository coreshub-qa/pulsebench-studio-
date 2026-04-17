from __future__ import annotations

import json
import shlex
from pathlib import Path
from typing import Any

from schemas import RunSpec


def normalize_url(url: str) -> str:
    if url.endswith("/chat/completions") or url.endswith("/completions"):
        return url
    if url.endswith("/v1"):
        return f"{url}/chat/completions"
    return f"{url.rstrip('/')}/chat/completions"


def build_evalscope_command(spec: RunSpec, outputs_dir: Path) -> list[str]:
    command = [
        "evalscope",
        "perf",
        "--model",
        spec.model,
        "--url",
        normalize_url(spec.url),
        "--parallel",
        *[str(item) for item in spec.parallel],
        "--number",
        *[str(item) for item in spec.number],
        "--dataset",
        spec.dataset,
        "--outputs-dir",
        str(outputs_dir),
    ]

    optional_flags: list[tuple[str, Any]] = [
        ("--tokenizer-path", spec.tokenizer_path),
        ("--dataset-path", spec.dataset_path),
        ("--min-prompt-length", spec.min_prompt_length),
        ("--max-prompt-length", spec.max_prompt_length),
        ("--min-tokens", spec.min_tokens),
        ("--max-tokens", spec.max_tokens),
    ]

    for flag, value in optional_flags:
        if value is not None and value != "":
            command.extend([flag, str(value)])

    if spec.extra_args:
        command.extend(["--extra-args", json.dumps(spec.extra_args, ensure_ascii=False)])
    if spec.api_key:
        command.extend(["--api-key", spec.api_key.get_secret_value()])

    return command


def render_command_preview(command: list[str]) -> str:
    redacted: list[str] = []
    hide_next = False
    for part in command:
        if hide_next:
            redacted.append("******")
            hide_next = False
            continue
        redacted.append(part)
        if part == "--api-key":
            hide_next = True
    return " ".join(shlex.quote(part) for part in redacted)

