from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from schemas import PercentileMetric, PerConcurrencyMetric, RunReport, RunSpec


TABLE_DIVIDER_RE = re.compile(r"^\|\s*[-: ]+\|\s*$")
PARALLEL_DIR_RE = re.compile(r"parallel_(\d+)_number_\d+")


def _try_float(value: str | None) -> float | None:
    if value is None:
        return None
    value = value.strip().replace("%", "")
    if not value or value == "---":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _try_int(value: str | None) -> int | None:
    number = _try_float(value)
    if number is None:
        return None
    return int(number)


def _compute_success_rate(item: dict[str, Any]) -> float | None:
    """Compute success rate from EvalScope JSON summary fields."""
    if "success_rate" in item and item["success_rate"] is not None:
        return float(item["success_rate"])
    total = item.get("Total requests")
    succeed = item.get("Succeed requests")
    if total and succeed and int(total) > 0:
        return round(int(succeed) / int(total) * 100, 2)
    return None


def _read_text_candidates(raw_dir: Path) -> str:
    candidates = []
    for pattern in ("performance_summary.txt", "benchmark.log", "*.txt", "*.md", "*.log"):
        candidates.extend(sorted(raw_dir.rglob(pattern)))
    seen: set[Path] = set()
    chunks: list[str] = []
    for path in candidates:
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        try:
            chunks.append(path.read_text(encoding="utf-8", errors="ignore"))
        except OSError:
            continue
    return "\n\n".join(chunks)


def _parse_markdown_tables(text: str) -> dict[str, list[dict[str, str]]]:
    tables: dict[str, list[dict[str, str]]] = {}
    current_title = "default"
    lines = text.splitlines()
    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        if line.startswith("### ") or line.startswith("#### "):
            current_title = line.lstrip("# ").strip()

        # --- Standard Markdown pipe tables ---
        if line.startswith("|") and idx + 1 < len(lines) and lines[idx + 1].strip().startswith("| ---"):
            headers = [item.strip() for item in line.strip("|").split("|")]
            idx += 2
            rows: list[dict[str, str]] = []
            while idx < len(lines) and lines[idx].strip().startswith("|"):
                values = [item.strip() for item in lines[idx].strip("|").split("|")]
                if len(values) == len(headers):
                    rows.append(dict(zip(headers, values)))
                idx += 1
            if rows:
                tables[current_title] = rows
            continue

        # --- Rich box-drawing tables (┃ for header, │ for data rows) ---
        if "┃" in line and not line.startswith("┏") and not line.startswith("┡"):
            # This is a Rich header row — may be multi-line headers
            header_lines = [line]
            peek = idx + 1
            # Collect continuation header lines (Rich wraps long headers)
            while peek < len(lines):
                peek_line = lines[peek].strip()
                if peek_line.startswith("┃"):
                    header_lines.append(peek_line)
                    peek += 1
                elif peek_line.startswith("┡") or peek_line.startswith("╞"):
                    peek += 1  # skip separator
                    break
                else:
                    break

            # Merge multi-line headers by joining vertically
            split_headers = [
                [cell.strip() for cell in hl.strip("┃").split("┃")]
                for hl in header_lines
            ]
            num_cols = max(len(row) for row in split_headers) if split_headers else 0
            headers_rich: list[str] = []
            for col_i in range(num_cols):
                parts = []
                for hl_cells in split_headers:
                    if col_i < len(hl_cells) and hl_cells[col_i].strip():
                        parts.append(hl_cells[col_i].strip())
                headers_rich.append(" ".join(parts))

            # Parse data rows
            rows_rich: list[dict[str, str]] = []
            while peek < len(lines):
                data_line = lines[peek].strip()
                if data_line.startswith("│"):
                    values_rich = [cell.strip() for cell in data_line.strip("│").split("│")]
                    if len(values_rich) == len(headers_rich):
                        rows_rich.append(dict(zip(headers_rich, values_rich)))
                    peek += 1
                elif data_line.startswith("├") or data_line.startswith("└") or data_line.startswith("┗"):
                    peek += 1
                else:
                    break
            if rows_rich:
                # Try to find a title from nearby lines
                title = current_title
                for back in range(max(0, idx - 3), idx):
                    back_line = lines[back].strip()
                    if back_line and not any(c in back_line for c in "┃│┏┡━─┌"):
                        title = back_line.strip()
                tables[title] = rows_rich
            idx = peek
            continue

        idx += 1
    return tables


def _infer_concurrency_from_path(path: Path) -> int | None:
    match = PARALLEL_DIR_RE.search(path.as_posix())
    if not match:
        return None
    return int(match.group(1))


def _load_json_candidates(raw_dir: Path) -> dict[str, list[dict[str, Any]]]:
    payloads: dict[str, list[dict[str, Any]]] = {}
    for name in (
        "benchmark_summary.json",
        "benchmark_percentile.json",
        "percentile_results.json",
        "summary.json",
        "report.json",
    ):
        entries: list[dict[str, Any]] = []
        for path in sorted(raw_dir.rglob(name)):
            try:
                entries.append(
                    {
                        "path": str(path),
                        "payload": json.loads(path.read_text(encoding="utf-8")),
                    }
                )
            except (OSError, json.JSONDecodeError):
                continue
        if entries:
            payloads[name] = entries
    return payloads


def _resolve_concurrency(item: dict[str, Any], fallback: int) -> int:
    return int(
        item.get("concurrency")
        or item.get("Number of concurrency")
        or fallback
    )


def _extract_overview_from_json(spec: RunSpec, payloads: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    summary_entries = payloads.get("benchmark_summary.json", [])
    resolved: list[tuple[int, dict[str, Any]]] = []
    for idx, entry in enumerate(summary_entries):
        entry_path = Path(str(entry.get("path", "")))
        summary_payload = entry.get("payload")
        inferred_concurrency = _infer_concurrency_from_path(entry_path)
        items = summary_payload if isinstance(summary_payload, list) else [summary_payload]
        for item_idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            fallback_concurrency = inferred_concurrency
            if fallback_concurrency is None:
                fallback_index = item_idx if len(items) > 1 else idx
                fallback_concurrency = spec.parallel[fallback_index] if fallback_index < len(spec.parallel) else 0
            resolved.append((_resolve_concurrency(item, fallback_concurrency), item))

    if not resolved:
        return {}

    summary_concurrency, summary = max(resolved, key=lambda item: item[0])
    succeed_requests = summary.get("Succeed requests")
    failed_requests = summary.get("Failed requests")
    total_requests = summary.get("Total requests")

    overview: dict[str, Any] = {
        "summaryConcurrency": summary_concurrency,
        "summaryTimeTakenSec": summary.get("Time taken for tests (s)"),
        "summaryRequestRate": summary.get("Request rate (req/s)"),
        "summaryTotalRequests": total_requests,
        "summarySucceededRequests": succeed_requests,
        "summaryFailedRequests": failed_requests,
        "summaryOutputTokensPerSec": summary.get("Output token throughput (tok/s)"),
        "summaryTotalTokensPerSec": summary.get("Total token throughput (tok/s)"),
        "summaryRequestThroughput": summary.get("Request throughput (req/s)"),
        "summaryAvgLatencySec": summary.get("Average latency (s)"),
        "summaryAvgTtftSec": summary.get("Average time to first token (s)"),
        "summaryAvgTpotSec": summary.get("Average time per output token (s)"),
        "summaryAvgItlSec": summary.get("Average inter-token latency (s)"),
        "summaryAvgInputTokensPerRequest": summary.get("Average input tokens per request"),
        "summaryAvgOutputTokensPerRequest": summary.get("Average output tokens per request"),
    }
    if total_requests and succeed_requests:
        overview["summarySuccessRate"] = round(int(succeed_requests) / max(int(total_requests), 1) * 100, 2)
    if failed_requests is None:
        overview["summaryFailedRequests"] = 0
    return overview


def _normalize_from_tables(
    spec: RunSpec,
    tables: dict[str, list[dict[str, str]]],
) -> tuple[list[PerConcurrencyMetric], list[PercentileMetric], dict[str, Any]]:
    per_concurrency: list[PerConcurrencyMetric] = []
    percentiles: list[PercentileMetric] = []

    detail_rows = tables.get("Detailed Performance Metrics", [])
    for row in detail_rows:
        metric = PerConcurrencyMetric(
            concurrency=_try_int(row.get("Conc.")) or 0,
            request_throughput=_try_float(row.get("RPS")),
            avg_latency_sec=_try_float(row.get("Avg Lat.(s)")),
            avg_ttft_sec=_try_float(row.get("Avg TTFT(s)")),
            avg_tpot_sec=_try_float(row.get("Avg TPOT(s)")),
            output_tokens_per_sec=_try_float(row.get("Gen. toks/s")),
            success_rate=_try_float(row.get("Success Rate")),
        )
        per_concurrency.append(metric)

    concurrency_for_percentiles = spec.parallel[0] if spec.parallel else 0
    percentile_rows = tables.get("Percentile results", [])
    for row in percentile_rows:
        percentiles.append(
            PercentileMetric(
                concurrency=concurrency_for_percentiles,
                percentile=row.get("Percentiles", ""),
                latency_sec=_try_float(row.get("Latency (s)")),
                ttft_sec=_try_float(row.get("TTFT (s)")),
                tpot_sec=_try_float(row.get("TPOT (s)")),
                itl_sec=_try_float(row.get("ITL (s)")),
            )
        )

    overview_rows = tables.get("汇总信息", []) or tables.get("Summary", [])
    overview: dict[str, Any] = {"model": spec.model}
    for row in overview_rows:
        key = row.get("项目") or row.get("Item") or row.get("Metric")
        value = row.get("值") or row.get("Value")
        if key:
            overview[key] = value
    return per_concurrency, percentiles, overview


def _normalize_from_json(
    spec: RunSpec,
    payloads: dict[str, list[dict[str, Any]]],
) -> tuple[list[PerConcurrencyMetric], list[PercentileMetric]]:
    per_concurrency_map: dict[int, PerConcurrencyMetric] = {}
    percentile_map: dict[tuple[int, str], PercentileMetric] = {}

    summary_entries = payloads.get("benchmark_summary.json", [])
    for idx, entry in enumerate(summary_entries):
        entry_path = Path(str(entry.get("path", "")))
        summary_payload = entry.get("payload")
        inferred_concurrency = _infer_concurrency_from_path(entry_path)
        items = summary_payload if isinstance(summary_payload, list) else [summary_payload]
        for item_idx, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            fallback_concurrency = inferred_concurrency
            if fallback_concurrency is None:
                fallback_index = item_idx if len(items) > 1 else idx
                fallback_concurrency = spec.parallel[fallback_index] if fallback_index < len(spec.parallel) else 0
            conc = _resolve_concurrency(item, fallback_concurrency)
            per_concurrency_map[int(conc)] = PerConcurrencyMetric(
                concurrency=int(conc),
                request_throughput=(
                    item.get("request_throughput")
                    or item.get("rps")
                    or item.get("Request throughput (req/s)")
                ),
                avg_latency_sec=(
                    item.get("latency")
                    or item.get("avg_latency")
                    or item.get("Average latency (s)")
                ),
                avg_ttft_sec=(
                    item.get("ttft")
                    or item.get("avg_ttft")
                    or item.get("Average time to first token (s)")
                ),
                avg_tpot_sec=(
                    item.get("tpot")
                    or item.get("avg_tpot")
                    or item.get("Average time per output token (s)")
                ),
                output_tokens_per_sec=(
                    item.get("output_throughput")
                    or item.get("output_tokens_per_sec")
                    or item.get("Output token throughput (tok/s)")
                ),
                success_rate=_compute_success_rate(item),
            )

    percentile_entries = payloads.get("benchmark_percentile.json") or payloads.get("percentile_results.json") or []
    for entry in percentile_entries:
        entry_path = Path(str(entry.get("path", "")))
        percentile_payload = entry.get("payload")
        inferred_concurrency = _infer_concurrency_from_path(entry_path)
        if not isinstance(percentile_payload, list):
            continue
        for item in percentile_payload:
            if not isinstance(item, dict):
                continue
            raw_pct = item.get("percentile") or item.get("Percentiles") or ""
            concurrency = int(item.get("concurrency", inferred_concurrency or (spec.parallel[0] if spec.parallel else 0)))
            percentile_map[(concurrency, str(raw_pct))] = PercentileMetric(
                concurrency=concurrency,
                percentile=str(raw_pct),
                latency_sec=item.get("latency") or item.get("Latency (s)"),
                ttft_sec=item.get("ttft") or item.get("TTFT (s)"),
                tpot_sec=item.get("tpot") or item.get("TPOT (s)"),
                itl_sec=item.get("itl") or item.get("ITL (s)"),
            )

    per_concurrency = [per_concurrency_map[key] for key in sorted(per_concurrency_map)]
    percentiles = [
        percentile_map[key]
        for key in sorted(
            percentile_map,
            key=lambda item: (item[0], item[1]),
        )
    ]
    return per_concurrency, percentiles


def _build_diagnosis(per_concurrency: list[PerConcurrencyMetric], percentiles: list[PercentileMetric]) -> list[str]:
    diagnosis: list[str] = []
    if not per_concurrency:
        return ["尚未识别出结构化性能指标，请检查原始产物或 EvalScope 版本兼容性。"]

    sorted_metrics = sorted(per_concurrency, key=lambda item: item.concurrency)
    first = sorted_metrics[0]
    last = sorted_metrics[-1]

    if first.output_tokens_per_sec and last.output_tokens_per_sec:
        growth = last.output_tokens_per_sec / max(first.output_tokens_per_sec, 0.0001)
        diagnosis.append(f"吞吐量从并发 {first.concurrency} 到 {last.concurrency} 提升约 {growth:.2f} 倍。")
    if first.avg_latency_sec and last.avg_latency_sec:
        delta = ((last.avg_latency_sec - first.avg_latency_sec) / max(first.avg_latency_sec, 0.0001)) * 100
        diagnosis.append(f"平均延迟变化约 {delta:.1f}%，可结合吞吐收益判断是否值得继续拉高并发。")

    p99 = next((item for item in percentiles if item.percentile == "99%"), None)
    if p99 and p99.ttft_sec and p99.ttft_sec > 1.0:
        diagnosis.append("P99 TTFT 偏高，优先检查预填充开销、上下文长度和服务端排队。")
    elif p99 and p99.tpot_sec and p99.tpot_sec > 0.02:
        diagnosis.append("P99 TPOT 偏高，输出阶段可能已成为瓶颈。")
    else:
        diagnosis.append("从已识别指标看，当前更像是整体容量探索阶段，可继续尝试更高并发。")

    return diagnosis


def normalize_report(run_dir: Path, spec: RunSpec, runtime_status: str) -> RunReport:
    raw_dir = run_dir / "raw"
    payloads = _load_json_candidates(raw_dir)
    summary_text = _read_text_candidates(raw_dir)
    tables = _parse_markdown_tables(summary_text)

    json_per_concurrency, json_percentiles = _normalize_from_json(spec, payloads)
    table_per_concurrency, table_percentiles, overview = _normalize_from_tables(spec, tables)
    overview.update(_extract_overview_from_json(spec, payloads))

    per_concurrency = json_per_concurrency or table_per_concurrency
    percentiles = json_percentiles or table_percentiles

    if "model" not in overview:
        overview["model"] = spec.model
    overview.setdefault("status", runtime_status)
    overview.setdefault("totalRequests", sum(spec.number))
    overview.setdefault("dataset", spec.dataset)
    overview["bestRps"] = max(
        (item.request_throughput for item in per_concurrency if item.request_throughput is not None),
        default=None,
    )
    overview["bestLatencySec"] = min(
        (item.avg_latency_sec for item in per_concurrency if item.avg_latency_sec is not None),
        default=None,
    )

    return RunReport(
        overview=overview,
        perConcurrency=per_concurrency,
        percentiles=percentiles,
        diagnosis=_build_diagnosis(per_concurrency, percentiles),
        artifacts={
            "rawDir": str(raw_dir),
            "hasLogs": bool(summary_text.strip()),
        },
        rawSummaryText=summary_text[:24000] if summary_text else None,
    )
