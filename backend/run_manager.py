from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import HTTPException

from config import Settings
from evalscope_runner import build_evalscope_command, render_command_preview
from report_normalizer import normalize_report
from schemas import (
    BatchCreateRequest,
    BatchManifest,
    BatchReport,
    BatchReportItem,
    BatchRunItem,
    BatchRuntime,
    HistoryItem,
    RunEvent,
    RunManifest,
    RunRuntime,
    RunSpec,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _json_default(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Unsupported value: {value!r}")


class RunManager:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.settings.runs_dir.mkdir(parents=True, exist_ok=True)
        self.settings.batches_dir.mkdir(parents=True, exist_ok=True)
        self._active_run_id: str | None = None
        self._active_batch_id: str | None = None
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._batch_tasks: dict[str, asyncio.Task[None]] = {}
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._lock = asyncio.Lock()

    async def create_run(self, spec: RunSpec) -> RunManifest:
        async with self._lock:
            self._ensure_idle()
            prepared = self._prepare_run(spec)
            self._active_run_id = prepared["run_id"]
            self._tasks[prepared["run_id"]] = asyncio.create_task(
                self._run_process(prepared["run_id"], spec, prepared["command"])
            )
            return prepared["manifest"]

    async def create_batch(self, request: BatchCreateRequest) -> BatchManifest:
        async with self._lock:
            self._ensure_idle()
            batch_id = self._next_batch_id()
            batch_dir = self._batch_dir(batch_id)
            batch_dir.mkdir(parents=True, exist_ok=False)

            runtime = BatchRuntime(
                batchId=batch_id,
                templateId=request.template_id,
                mode=request.mode,
                title=request.title or f"{request.template_id} · {batch_id}",
                status="pending",
                createdAt=_utcnow(),
                totalRuns=len(request.runs),
                currentIndex=0,
                message="等待启动",
            )
            self._write_json(batch_dir / "request.json", request.public_dict())
            self._write_json(batch_dir / "runtime.json", runtime.model_dump(by_alias=True))
            self._write_json(batch_dir / "items.json", [])
            self._active_batch_id = batch_id
            self._batch_tasks[batch_id] = asyncio.create_task(self._run_batch(batch_id, request))

            return BatchManifest(
                batchId=batch_id,
                templateId=request.template_id,
                mode=request.mode,
                title=runtime.title,
                status="pending",
                createdAt=runtime.created_at,
                totalRuns=len(request.runs),
            )

    def _ensure_idle(self) -> None:
        if self._active_batch_id and self._is_batch_active(self._active_batch_id):
            raise HTTPException(status_code=409, detail="当前已有运行中的批次任务。")
        if self._active_run_id and self._is_runtime_active(self._active_run_id):
            raise HTTPException(status_code=409, detail="当前已有运行中的压测任务。")

    def _next_run_id(self) -> str:
        run_id = _utcnow().strftime("%Y%m%d-%H%M%S")
        counter = 1
        while (self.settings.runs_dir / run_id).exists():
            counter += 1
            run_id = f"{_utcnow().strftime('%Y%m%d-%H%M%S')}-{counter}"
        return run_id

    def _next_batch_id(self) -> str:
        batch_id = f"batch-{_utcnow().strftime('%Y%m%d-%H%M%S')}"
        counter = 1
        while (self.settings.batches_dir / batch_id).exists():
            counter += 1
            batch_id = f"batch-{_utcnow().strftime('%Y%m%d-%H%M%S')}-{counter}"
        return batch_id

    def _run_dir(self, run_id: str) -> Path:
        return self.settings.runs_dir / run_id

    def _batch_dir(self, batch_id: str) -> Path:
        return self.settings.batches_dir / batch_id

    def _runtime_path(self, run_id: str) -> Path:
        return self._run_dir(run_id) / "runtime.json"

    def _batch_runtime_path(self, batch_id: str) -> Path:
        return self._batch_dir(batch_id) / "runtime.json"

    def _load_runtime(self, run_id: str) -> RunRuntime:
        path = self._runtime_path(run_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="未找到该运行记录。")
        return RunRuntime.model_validate_json(path.read_text(encoding="utf-8"))

    def _load_batch_runtime(self, batch_id: str) -> BatchRuntime:
        path = self._batch_runtime_path(batch_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="未找到该批次记录。")
        return BatchRuntime.model_validate_json(path.read_text(encoding="utf-8"))

    def _write_json(self, path: Path, payload: object) -> None:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default), encoding="utf-8")

    def _update_runtime(self, run_id: str, **changes: object) -> RunRuntime:
        runtime = self._load_runtime(run_id)
        updated = runtime.model_copy(update=changes)
        self._write_json(self._runtime_path(run_id), updated.model_dump(by_alias=True))
        return updated

    def _update_batch_runtime(self, batch_id: str, **changes: object) -> BatchRuntime:
        runtime = self._load_batch_runtime(batch_id)
        updated = runtime.model_copy(update=changes)
        self._write_json(self._batch_runtime_path(batch_id), updated.model_dump(by_alias=True))
        return updated

    def _items_path(self, batch_id: str) -> Path:
        return self._batch_dir(batch_id) / "items.json"

    def _load_batch_items(self, batch_id: str) -> list[dict[str, Any]]:
        path = self._items_path(batch_id)
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _hydrate_batch_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        hydrated: list[dict[str, Any]] = []
        for item in items:
            current = dict(item)
            run_id = current.get("runId")
            if isinstance(run_id, str):
                runtime_path = self._run_dir(run_id) / "runtime.json"
                report_path = self._run_dir(run_id) / "report.json"
                if runtime_path.exists():
                    try:
                        runtime = RunRuntime.model_validate_json(runtime_path.read_text(encoding="utf-8"))
                        current["status"] = runtime.status
                        current["startedAt"] = runtime.started_at
                        current["finishedAt"] = runtime.finished_at
                    except Exception:
                        pass
                if report_path.exists():
                    try:
                        report = json.loads(report_path.read_text(encoding="utf-8"))
                        current["reportOverview"] = report.get("overview")
                    except Exception:
                        pass
            hydrated.append(current)
        return hydrated

    def _write_batch_items(self, batch_id: str, items: list[dict[str, Any]]) -> None:
        self._write_json(self._items_path(batch_id), items)

    def _append_batch_item(self, batch_id: str, item: dict[str, Any]) -> None:
        items = self._load_batch_items(batch_id)
        items.append(item)
        self._write_batch_items(batch_id, items)

    def _prepare_run(self, spec: RunSpec, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        run_id = self._next_run_id()
        run_dir = self.settings.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=False)
        (run_dir / "raw").mkdir(parents=True, exist_ok=True)
        command = build_evalscope_command(spec, run_dir / "raw")
        preview = render_command_preview(command)
        title = spec.title or f"{spec.model} · {run_id}"
        runtime = RunRuntime(
            runId=run_id,
            status="pending",
            createdAt=_utcnow(),
            phase="queued",
            message="等待启动",
        )
        spec_payload = spec.public_dict()
        if metadata:
            spec_payload["_metadata"] = metadata
        self._write_json(run_dir / "spec.json", spec_payload)
        self._write_json(run_dir / "runtime.json", runtime.model_dump(by_alias=True))
        (run_dir / "command.txt").write_text(preview, encoding="utf-8")
        self._append_event(run_id, RunEvent(type="stage", ts=_utcnow(), message="任务已创建", phase="queued"))
        return {
            "run_id": run_id,
            "command": command,
            "manifest": RunManifest(
                runId=run_id,
                title=title,
                commandPreview=preview,
                status="pending",
                createdAt=runtime.created_at,
            ),
        }

    def _events_path(self, run_id: str) -> Path:
        return self._run_dir(run_id) / "events.log"

    def _load_events(self, run_id: str, limit: int | None = None) -> list[dict[str, Any]]:
        path = self._events_path(run_id)
        if not path.exists():
            return []
        events: list[dict[str, Any]] = []
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            return []
        if limit is not None:
            lines = lines[-limit:]
        for line in lines:
            if not line.strip():
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                events.append(payload)
        return events

    def _collect_raw_log_snippets(
        self,
        run_id: str,
        *,
        max_files: int = 4,
        max_chars: int = 2400,
    ) -> list[dict[str, str]]:
        raw_dir = self._run_dir(run_id) / "raw"
        if not raw_dir.exists():
            return []

        candidates: list[Path] = []
        for pattern in ("*.log", "*.txt", "*.md", "*.out", "*.err"):
            candidates.extend(sorted(raw_dir.rglob(pattern)))

        snippets: list[dict[str, str]] = []
        seen: set[Path] = set()
        for path in candidates:
            if path in seen or not path.is_file():
                continue
            seen.add(path)
            try:
                content = path.read_text(encoding="utf-8", errors="ignore").strip()
            except OSError:
                continue
            if not content:
                continue
            snippets.append(
                {
                    "path": str(path.relative_to(self._run_dir(run_id))),
                    "tail": content[-max_chars:],
                }
            )
            if len(snippets) >= max_files:
                break
        return snippets

    def _append_event(self, run_id: str, event: RunEvent) -> None:
        with self._events_path(run_id).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event.model_dump(), ensure_ascii=False, default=_json_default) + "\n")

    def _is_runtime_active(self, run_id: str) -> bool:
        runtime = self._load_runtime(run_id)
        return runtime.status in {"pending", "starting", "running"}

    def _is_batch_active(self, batch_id: str) -> bool:
        runtime = self._load_batch_runtime(batch_id)
        return runtime.status in {"pending", "running"}

    async def _run_batch(self, batch_id: str, request: BatchCreateRequest) -> None:
        self._update_batch_runtime(
            batch_id,
            status="running",
            started_at=_utcnow(),
            message="批次运行中",
            current_index=0,
        )
        statuses: list[str] = []
        try:
            for index, item in enumerate(request.runs, start=1):
                async with self._lock:
                    metadata = {
                        "batchId": batch_id,
                        "label": item.label,
                        "objective": item.objective,
                        "templateId": request.template_id,
                    }
                    prepared = self._prepare_run(item.spec, metadata=metadata)
                    self._active_run_id = prepared["run_id"]
                    self._update_batch_runtime(
                        batch_id,
                        current_index=index,
                        message=f"正在执行第 {index}/{len(request.runs)} 项：{item.label}",
                    )
                    self._append_batch_item(
                        batch_id,
                        {
                            "runId": prepared["run_id"],
                            "label": item.label,
                            "objective": item.objective,
                            "title": prepared["manifest"].title,
                            "status": "pending",
                            "createdAt": prepared["manifest"].created_at,
                        },
                    )

                task = asyncio.create_task(self._run_process(prepared["run_id"], item.spec, prepared["command"]))
                self._tasks[prepared["run_id"]] = task
                await task
                runtime = self._load_runtime(prepared["run_id"])
                statuses.append(runtime.status)
                self._sync_batch_item(batch_id, prepared["run_id"])
                if self._load_batch_runtime(batch_id).status == "stopped":
                    break

            final_status = self._resolve_batch_status(statuses, self._load_batch_runtime(batch_id).status)
            report = self._build_batch_report(batch_id, request)
            self._write_json(self._batch_dir(batch_id) / "report.json", report.model_dump(by_alias=True))
            self._update_batch_runtime(
                batch_id,
                status=final_status,
                finished_at=_utcnow(),
                message="批次完成" if final_status in {"success", "partial"} else "批次结束",
            )
        except Exception as exc:
            self._update_batch_runtime(
                batch_id,
                status="failed",
                finished_at=_utcnow(),
                message=f"批次异常: {exc}",
            )
        finally:
            self._active_batch_id = None

    def _resolve_batch_status(self, statuses: list[str], current_status: str) -> str:
        if current_status == "stopped":
            return "stopped"
        if not statuses:
            return "failed"
        unique = set(statuses)
        if unique == {"success"}:
            return "success"
        if "success" in unique and ("failed" in unique or "stopped" in unique):
            return "partial"
        if "failed" in unique:
            return "failed"
        if "stopped" in unique:
            return "stopped"
        return "partial"

    def _sync_batch_item(self, batch_id: str, run_id: str) -> None:
        items = self._load_batch_items(batch_id)
        runtime = self._load_runtime(run_id)
        report = self.get_report(run_id) if (self._run_dir(run_id) / "report.json").exists() else None
        updated_items: list[dict[str, Any]] = []
        for item in items:
            if item["runId"] == run_id:
                item["status"] = runtime.status
                item["startedAt"] = runtime.started_at
                item["finishedAt"] = runtime.finished_at
                item["reportOverview"] = report["overview"] if report else None
            updated_items.append(item)
        self._write_batch_items(batch_id, updated_items)

    async def _run_process(self, run_id: str, spec: RunSpec, command: list[str]) -> None:
        run_dir = self._run_dir(run_id)
        raw_dir = run_dir / "raw"
        self._update_runtime(
            run_id,
            status="starting",
            started_at=_utcnow(),
            phase="boot",
            message="正在启动 EvalScope",
        )
        self._append_event(run_id, RunEvent(type="stage", ts=_utcnow(), message="启动 EvalScope", phase="boot"))

        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(raw_dir),
            )
            self._processes[run_id] = process
            self._update_runtime(run_id, status="running", phase="run", message="压测运行中")
            self._append_event(run_id, RunEvent(type="stage", ts=_utcnow(), message="压测运行中", phase="run"))

            assert process.stdout is not None
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="ignore").rstrip()
                if text:
                    self._append_event(run_id, RunEvent(type="log", ts=_utcnow(), message=text, phase="run"))

            exit_code = await process.wait()
            current_runtime = self._load_runtime(run_id)
            if current_runtime.status == "stopped":
                return
            runtime_status = "success" if exit_code == 0 else "failed"
            phase = "done" if exit_code == 0 else "error"
            report = normalize_report(run_dir, spec, runtime_status)
            self._write_json(run_dir / "report.json", report.model_dump(by_alias=True))
            self._update_runtime(
                run_id,
                status=runtime_status,
                finished_at=_utcnow(),
                exit_code=exit_code,
                phase=phase,
                message="任务完成" if exit_code == 0 else "任务失败",
            )
            self._append_event(
                run_id,
                RunEvent(
                    type="done",
                    ts=_utcnow(),
                    message="任务完成" if exit_code == 0 else f"任务失败，退出码 {exit_code}",
                    phase=phase,
                    level="info" if exit_code == 0 else "error",
                ),
            )
        except FileNotFoundError:
            message = "未找到 evalscope 可执行文件，请确认镜像内已安装 evalscope[perf]。"
            if self.settings.allow_mock:
                self._append_event(run_id, RunEvent(type="warning", ts=_utcnow(), message="进入 mock 模式", phase="mock"))
                self._write_mock_outputs(run_dir, spec)
                report = normalize_report(run_dir, spec, "success")
                self._write_json(run_dir / "report.json", report.model_dump(by_alias=True))
                self._update_runtime(run_id, status="success", finished_at=_utcnow(), exit_code=0, phase="done", message="Mock 运行完成")
                self._append_event(run_id, RunEvent(type="done", ts=_utcnow(), message="Mock 运行完成", phase="done"))
            else:
                self._update_runtime(run_id, status="failed", finished_at=_utcnow(), exit_code=127, phase="error", message=message)
                self._append_event(run_id, RunEvent(type="done", ts=_utcnow(), message=message, phase="error", level="error"))
        except Exception as exc:
            self._update_runtime(run_id, status="failed", finished_at=_utcnow(), phase="error", message=str(exc))
            self._append_event(run_id, RunEvent(type="done", ts=_utcnow(), message=f"任务异常: {exc}", phase="error", level="error"))
        finally:
            self._active_run_id = None
            self._processes.pop(run_id, None)

    def _write_mock_outputs(self, run_dir: Path, spec: RunSpec) -> None:
        raw_dir = run_dir / "raw"
        mock_text = f"""### 汇总信息
| 项目 | 值 |
| --- | --- |
| Model | {spec.model} |
| Total Generated | 30720 tokens |
| Total Test Time | 70.94 seconds |

### Detailed Performance Metrics
| Conc. | RPS | Avg Lat.(s) | P99 Lat.(s) | Gen. toks/s | Avg TTFT(s) | P99 TTFT(s) | Avg TPOT(s) | P99 TPOT(s) | Success Rate |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0.17 | 5.757 | 5.876 | 177.28 | 0.343 | 0.423 | 0.005 | 0.005 | 100.0% |
| 10 | 1.52 | 6.569 | 6.611 | 1553.59 | 0.405 | 0.444 | 0.006 | 0.006 | 100.0% |

### Percentile results
| Percentiles | TTFT (s) | ITL (s) | TPOT (s) | Latency (s) |
| --- | ---: | ---: | ---: | ---: |
| 50% | 0.4074 | 0.0060 | 0.0060 | 6.5760 |
| 90% | 0.4257 | 0.0064 | 0.0060 | 6.5973 |
| 99% | 0.4439 | 0.0080 | 0.0060 | 6.6111 |
"""
        (raw_dir / "performance_summary.txt").write_text(mock_text, encoding="utf-8")
        (raw_dir / "benchmark.log").write_text("mock log\n", encoding="utf-8")

    async def stop_run(self, run_id: str) -> RunRuntime:
        process = self._processes.get(run_id)
        if not process:
            raise HTTPException(status_code=409, detail="当前任务不在运行中。")
        process.terminate()
        self._append_event(run_id, RunEvent(type="warning", ts=_utcnow(), message="已发送停止信号", phase="stopping"))
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except asyncio.TimeoutError:
            process.kill()
        runtime = self._update_runtime(
            run_id,
            status="stopped",
            finished_at=_utcnow(),
            exit_code=-15,
            phase="stopped",
            message="任务已停止",
        )
        self._append_event(run_id, RunEvent(type="done", ts=_utcnow(), message="任务已停止", phase="stopped", level="warning"))
        self._active_run_id = None
        return runtime

    async def stop_batch(self, batch_id: str) -> BatchRuntime:
        runtime = self._load_batch_runtime(batch_id)
        if runtime.status not in {"pending", "running"}:
            raise HTTPException(status_code=409, detail="当前批次不在运行中。")
        self._update_batch_runtime(batch_id, status="stopped", finished_at=_utcnow(), message="批次已停止")
        if self._active_run_id and self._is_runtime_active(self._active_run_id):
            await self.stop_run(self._active_run_id)
        self._active_batch_id = None
        return self._load_batch_runtime(batch_id)

    def get_manifest(self, run_id: str) -> dict[str, object]:
        run_dir = self._run_dir(run_id)
        if not run_dir.exists():
            raise HTTPException(status_code=404, detail="未找到该运行记录。")
        runtime = self._load_runtime(run_id)
        command = (run_dir / "command.txt").read_text(encoding="utf-8") if (run_dir / "command.txt").exists() else ""
        spec = json.loads((run_dir / "spec.json").read_text(encoding="utf-8")) if (run_dir / "spec.json").exists() else {}
        return {
            "runId": run_id,
            "runtime": runtime.model_dump(by_alias=True),
            "commandPreview": command,
            "spec": spec,
            "hasReport": (run_dir / "report.json").exists(),
        }

    def get_report(self, run_id: str) -> dict[str, object]:
        report_path = self._run_dir(run_id) / "report.json"
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="报告尚未生成。")
        return json.loads(report_path.read_text(encoding="utf-8"))

    def get_ai_context(self, run_id: str) -> dict[str, object]:
        manifest = self.get_manifest(run_id)
        runtime = manifest["runtime"]
        events = self._load_events(run_id, limit=160)
        raw_snippets = self._collect_raw_log_snippets(run_id)
        error_events = [
            event
            for event in events
            if event.get("level") == "error"
            or event.get("phase") == "error"
            or "error" in str(event.get("message", "")).lower()
            or "failed" in str(event.get("message", "")).lower()
            or "失败" in str(event.get("message", ""))
            or "异常" in str(event.get("message", ""))
        ]

        report: dict[str, object] | None = None
        if manifest["hasReport"]:
            report = self.get_report(run_id)

        failure_context: dict[str, object] | None = None
        if runtime["status"] == "failed" or error_events or raw_snippets:
            failure_context = {
                "runtimeStatus": runtime["status"],
                "runtimeMessage": runtime["message"],
                "exitCode": runtime.get("exitCode"),
                "errorEvents": error_events[-24:],
                "recentEvents": events[-80:],
                "rawLogSnippets": raw_snippets,
            }

        return {
            "runId": run_id,
            "runtime": runtime,
            "spec": manifest["spec"],
            "commandPreview": manifest["commandPreview"],
            "report": report,
            "failureContext": failure_context,
        }

    def get_batch(self, batch_id: str) -> dict[str, object]:
        batch_dir = self._batch_dir(batch_id)
        if not batch_dir.exists():
            raise HTTPException(status_code=404, detail="未找到该批次记录。")
        runtime = self._load_batch_runtime(batch_id)
        items = self._hydrate_batch_items(self._load_batch_items(batch_id))
        request = json.loads((batch_dir / "request.json").read_text(encoding="utf-8"))
        return {
            "batchId": batch_id,
            "runtime": runtime.model_dump(by_alias=True),
            "request": request,
            "items": items,
            "hasReport": (batch_dir / "report.json").exists(),
        }

    def get_batch_report(self, batch_id: str) -> dict[str, object]:
        report_path = self._batch_dir(batch_id) / "report.json"
        if not report_path.exists():
            raise HTTPException(status_code=404, detail="批次报告尚未生成。")
        return json.loads(report_path.read_text(encoding="utf-8"))

    def list_history(self) -> list[HistoryItem]:
        items: list[HistoryItem] = []
        for run_dir in sorted(self.settings.runs_dir.iterdir(), reverse=True):
            if not run_dir.is_dir():
                continue
            try:
                runtime = RunRuntime.model_validate_json((run_dir / "runtime.json").read_text(encoding="utf-8"))
                spec = json.loads((run_dir / "spec.json").read_text(encoding="utf-8"))
                report = json.loads((run_dir / "report.json").read_text(encoding="utf-8")) if (run_dir / "report.json").exists() else {}
                overview = report.get("overview", {})
                items.append(
                    HistoryItem(
                        runId=run_dir.name,
                        title=spec.get("title") or f"{spec.get('model', '未命名')} · {run_dir.name}",
                        model=spec.get("model", "未知模型"),
                        status=runtime.status,
                        createdAt=runtime.created_at,
                        bestRps=overview.get("bestRps"),
                        bestLatencySec=overview.get("bestLatencySec"),
                        totalRequests=overview.get("totalRequests"),
                    )
                )
            except Exception:
                continue
        return items

    def list_batches(self) -> list[dict[str, object]]:
        items: list[dict[str, object]] = []
        for batch_dir in sorted(self.settings.batches_dir.iterdir(), reverse=True):
            if not batch_dir.is_dir():
                continue
            try:
                runtime = BatchRuntime.model_validate_json((batch_dir / "runtime.json").read_text(encoding="utf-8"))
                items.append(
                    BatchManifest(
                        batchId=batch_dir.name,
                        templateId=runtime.template_id,
                        mode=runtime.mode,
                        title=runtime.title,
                        status=runtime.status,
                        createdAt=runtime.created_at,
                        totalRuns=runtime.total_runs,
                    ).model_dump(by_alias=True)
                )
            except Exception:
                continue
        return items

    def _build_batch_report(self, batch_id: str, request: BatchCreateRequest) -> BatchReport:
        items = self._load_batch_items(batch_id)
        report_items: list[BatchReportItem] = []
        success_runs = 0
        for item in items:
            overview = item.get("reportOverview") or {}
            if item.get("status") == "success":
                success_runs += 1
            report_items.append(
                BatchReportItem(
                    runId=item["runId"],
                    label=item["label"],
                    objective=item["objective"],
                    title=item["title"],
                    status=item["status"],
                    bestRps=overview.get("bestRps"),
                    bestLatencySec=overview.get("bestLatencySec"),
                    totalRequests=overview.get("totalRequests"),
                    successRate=overview.get("successRate"),
                )
            )
        overview = {
            "batchId": batch_id,
            "templateId": request.template_id,
            "mode": request.mode,
            "totalRuns": len(items),
            "successfulRuns": success_runs,
            "failedRuns": len(items) - success_runs,
            "bestRps": max((item.best_rps for item in report_items if item.best_rps is not None), default=None),
            "bestLatencySec": min(
                (item.best_latency_sec for item in report_items if item.best_latency_sec is not None),
                default=None,
            ),
        }
        diagnosis: list[str] = []
        if success_runs == len(items):
            diagnosis.append("该批次所有场景均成功完成，可直接进入批次报告对比。")
        elif success_runs == 0:
            diagnosis.append("该批次全部失败，优先检查服务可达性、tokenizer 路径和数据集条件。")
        else:
            diagnosis.append("该批次存在部分失败场景，说明模型或服务在部分负载下稳定性不足。")
        if overview["bestRps"] is not None:
            diagnosis.append(f"本批次最高输出吞吐对应的场景 best RPS 为 {overview['bestRps']:.2f}。")
        if overview["bestLatencySec"] is not None:
            diagnosis.append(f"本批次最低平均延迟场景的 best latency 为 {overview['bestLatencySec']:.2f}s。")
        return BatchReport(overview=overview, items=report_items, diagnosis=diagnosis)

    async def stream_events(self, run_id: str) -> AsyncIterator[str]:
        events_path = self._events_path(run_id)
        if not events_path.exists():
            raise HTTPException(status_code=404, detail="未找到事件流。")
        cursor = 0
        idle_cycles = 0
        while True:
            content = events_path.read_text(encoding="utf-8") if events_path.exists() else ""
            if cursor < len(content):
                chunk = content[cursor:]
                cursor = len(content)
                idle_cycles = 0
                for line in chunk.splitlines():
                    if line.strip():
                        yield f"data: {line}\n\n"
            else:
                idle_cycles += 1
                yield ": keepalive\n\n"
            runtime = self._load_runtime(run_id)
            if runtime.status in {"success", "failed", "stopped"} and idle_cycles > 2:
                break
            await asyncio.sleep(1)
