from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BuiltinDatasetSpec:
    alias: str
    file_name: str
    evalscope_dataset: str
    label: str
    hint: str
    prompt_range: tuple[int, int]
    tip: str


OPENQA_FILE = "quickcheck_openqa.jsonl"
LONGALPACA_FILE = "quickcheck_longalpaca.json"
CHAT_SHORT_FILE = "builtin_chat_short.jsonl"
RAG_MEDIUM_CONTEXT_FILE = "builtin_rag_medium_context.json"
CODE_GENERATION_FILE = "builtin_code_generation.json"
CODE_EDITING_FILE = "builtin_code_editing.json"
CODE_DEBUGGING_FILE = "builtin_code_debugging.json"
LONG_CONTEXT_ANALYSIS_FILE = "builtin_long_context_analysis.json"


BUILTIN_DATASET_SPECS: dict[str, BuiltinDatasetSpec] = {
    "openqa": BuiltinDatasetSpec(
        alias="openqa",
        file_name=OPENQA_FILE,
        evalscope_dataset="openqa",
        label="OpenQA",
        hint="短 prompt 基准",
        prompt_range=(0, 256),
        tip="适合首轮验活和短问答场景，主要看 TTFT 和基础成功率。",
    ),
    "longalpaca": BuiltinDatasetSpec(
        alias="longalpaca",
        file_name=LONGALPACA_FILE,
        evalscope_dataset="longalpaca",
        label="LongAlpaca",
        hint="长上下文基准",
        prompt_range=(4096, 12288),
        tip="适合通用长文本压测，偏重长输入和稳定性观察。",
    ),
    "chat_short": BuiltinDatasetSpec(
        alias="chat_short",
        file_name=CHAT_SHORT_FILE,
        evalscope_dataset="openqa",
        label="短对话场景",
        hint="内置短对话样本",
        prompt_range=(128, 2048),
        tip="适合助手、客服、日常问答等短输入场景。",
    ),
    "rag_medium_context": BuiltinDatasetSpec(
        alias="rag_medium_context",
        file_name=RAG_MEDIUM_CONTEXT_FILE,
        evalscope_dataset="longalpaca",
        label="RAG 中上下文",
        hint="多段资料问答",
        prompt_range=(4096, 16384),
        tip="适合模拟检索增强问答，关注中长输入下的 TTFT 和成功率。",
    ),
    "code_generation": BuiltinDatasetSpec(
        alias="code_generation",
        file_name=CODE_GENERATION_FILE,
        evalscope_dataset="longalpaca",
        label="Coding 代码生成",
        hint="内置编码任务样本",
        prompt_range=(2048, 12288),
        tip="适合代码生成、重构、调试、测试生成场景，优先观察输出速度和长尾延迟。",
    ),
    "code_editing": BuiltinDatasetSpec(
        alias="code_editing",
        file_name=CODE_EDITING_FILE,
        evalscope_dataset="longalpaca",
        label="Coding 代码编辑",
        hint="带源码上下文的修改任务",
        prompt_range=(4096, 16384),
        tip="适合带已有代码上下文的定向修改、重构和补测试场景，更接近真实工程工作负载。",
    ),
    "code_debugging": BuiltinDatasetSpec(
        alias="code_debugging",
        file_name=CODE_DEBUGGING_FILE,
        evalscope_dataset="longalpaca",
        label="Coding 代码排错",
        hint="带报错和堆栈的修复任务",
        prompt_range=(4096, 16384),
        tip="适合异常排查、日志定位和修复建议场景，重点观察长输入下的 TTFT 和稳定性。",
    ),
    "long_context_analysis": BuiltinDatasetSpec(
        alias="long_context_analysis",
        file_name=LONG_CONTEXT_ANALYSIS_FILE,
        evalscope_dataset="longalpaca",
        label="长文分析",
        hint="超长分析任务",
        prompt_range=(16384, 131072),
        tip="适合长文档分析、复盘和多资料对照，重点看长输入下的 TTFT 与稳定性。",
    ),
}


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

_CHAT_SHORT_QUESTIONS = [
    "请把这段会议纪要压缩成 5 条行动项，语气专业一点。",
    "用户反馈“回答有点慢”，我应该先看哪两个指标？",
    "帮我写一段给业务方看的说明，解释为什么高并发下体验会波动。",
    "如果我只想快速验活一个新推理服务，最小测试矩阵怎么配？",
    "请把“吞吐上去了但体验变差”用非技术语言解释给运营同学。",
    "帮我列一个 3 步排查单，处理首 Token 明显变慢的问题。",
    "如果 P50 很好但 P99 很差，应该怎么理解？",
    "给我一个适合日报的压测结果摘要模板。",
    "请比较短问答场景和长文生成场景的性能关注点。",
    "如果服务成功率 100% 但响应特别慢，这个结果算通过吗？",
    "帮我把这句话改写得更像客服助手：已收到你的问题，我们马上处理。",
    "做首轮验活时，为什么不建议直接上高并发冲顶？",
    "请用一句话解释什么是稳定并发区间。",
    "如何判断当前瓶颈更像是 prefill 还是 decode？",
    "帮我给老板写一句总结：本轮压测最重要的风险是什么。",
    "为什么相同参数量模型在不同引擎上吞吐差很多？",
    "给我一个适合交互体验测试的默认输入输出长度建议。",
    "如果模型是客服助手，应该优先看 TTFT 还是总吞吐？",
    "压测时出现少量超时，应该先看日志还是先降并发？",
    "请概括长上下文模型上线前必须做的两类专项测试。",
    "为什么请求分布不真实时，压测结论会失真？",
    "把“成功率、吞吐、延迟”这三个词写成一段易懂说明。",
    "如果我只有 10 分钟测试预算，应该怎么取舍？",
    "怎么向产品经理解释为什么要做第二轮定向复测？",
]


def default_builtin_datasets_dir() -> Path:
    return Path(__file__).resolve().parent / "assets" / "datasets"


def get_builtin_dataset_spec(dataset: str) -> BuiltinDatasetSpec | None:
    return BUILTIN_DATASET_SPECS.get(dataset)


def builtin_dataset_path(dataset: str, root: Path | None = None) -> str | None:
    spec = get_builtin_dataset_spec(dataset)
    if spec is None:
        return None
    base = root or default_builtin_datasets_dir()
    return str((base / spec.file_name).resolve())


def resolve_evalscope_dataset(dataset: str) -> str:
    spec = get_builtin_dataset_spec(dataset)
    if spec is None:
        return dataset
    return spec.evalscope_dataset


def builtin_dataset_aliases() -> list[str]:
    return list(BUILTIN_DATASET_SPECS.keys())


def _build_openqa_rows() -> list[dict[str, str]]:
    return [{"question": question} for question in _SHORT_QUESTIONS]


def _build_chat_short_rows() -> list[dict[str, str]]:
    return [{"question": question} for question in _CHAT_SHORT_QUESTIONS]


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


def _expand_to_length(seed: str, detail_block: str, target_length: int) -> str:
    fragments = [seed]
    section = 1
    while len("".join(fragments)) < target_length:
        fragments.append(f"\n\n第{section}段补充说明：{detail_block}")
        section += 1
    return "".join(fragments)


def _code_fence(language: str, content: str) -> str:
    fence = {
        "Python": "python",
        "TypeScript": "ts",
        "Go": "go",
        "SQL": "sql",
        "Rust": "rust",
        "Dockerfile": "dockerfile",
        "Java": "java",
    }.get(language, "text")
    return f"```{fence}\n{content.strip()}\n```"


def _editing_code_sample(language: str) -> str:
    samples = {
        "Python": """
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()
listeners = {}

async def event_stream(request: Request, job_id: str):
    queue = asyncio.Queue()
    listeners.setdefault(job_id, []).append(queue)
    while True:
        item = await queue.get()
        yield f"data: {item}\\n\\n"
        if await request.is_disconnected():
            break

@app.get("/jobs/{job_id}/events")
async def stream_events(request: Request, job_id: str):
    return StreamingResponse(event_stream(request, job_id), media_type="text/event-stream")
""",
        "TypeScript": """
type Row = { id: string; score: number; status: "idle" | "loading" | "done" };

export function ResultTable({ fetchRows }: { fetchRows: () => Promise<Row[]> }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [sortKey, setSortKey] = useState<"score" | "status">("score");

  useEffect(() => {
    fetchRows().then((data) => {
      setRows(data.sort((a, b) => Number(b[sortKey]) - Number(a[sortKey])));
    });
  }, [fetchRows]);

  return (
    <table>
      <button onClick={() => setSortKey("status")}>status</button>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}><td>{row.id}</td><td>{row.score}</td><td>{row.status}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
""",
        "Go": """
type CacheItem struct {
    Value     []byte
    ExpiresAt time.Time
}

type Cache struct {
    mu    sync.RWMutex
    items map[string]CacheItem
}

func (c *Cache) Get(key string) ([]byte, bool) {
    c.mu.RLock()
    item, ok := c.items[key]
    c.mu.RUnlock()
    if !ok {
        return nil, false
    }
    if time.Now().After(item.ExpiresAt) {
        delete(c.items, key)
        return nil, false
    }
    return item.Value, true
}
""",
        "SQL": """
CREATE OR REPLACE FUNCTION build_user_query(status_filter TEXT, keyword TEXT)
RETURNS TEXT AS $$
DECLARE
    query TEXT := 'SELECT id, name, status FROM users';
BEGIN
    IF status_filter IS NOT NULL THEN
        query := query || ' WHERE status = ''' || status_filter || '''';
    END IF;

    IF keyword IS NOT NULL THEN
        query := query || ' AND name LIKE ''%' || keyword || '%''';
    END IF;

    RETURN query;
END;
$$ LANGUAGE plpgsql;
""",
        "Rust": """
pub async fn flush_batch(writer: Arc<Mutex<Writer>>, buffer: Arc<Mutex<Vec<String>>>) -> anyhow::Result<()> {
    let mut guard = buffer.lock().await;
    if guard.is_empty() {
        return Ok(());
    }
    let payload = guard.join("\\n");
    writer.lock().await.write_all(payload.as_bytes()).await?;
    guard.clear();
    Ok(())
}
""",
        "Dockerfile": """
FROM node:20 AS build
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
COPY --from=build /app/dist ./dist
CMD ["python", "server.py"]
""",
    }
    return samples.get(language, samples["Python"]).strip()


def _debugging_code_sample(language: str) -> str:
    samples = {
        "Python": """
async def stream_response(request, producer):
    queue = asyncio.Queue()
    producer.register(queue)
    try:
        while True:
            chunk = await queue.get()
            yield chunk
    finally:
        logger.info("stream closed")
""",
        "Go": """
func proxyHandler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
    defer cancel()

    resp, err := upstreamClient.Do(r.WithContext(ctx))
    if err != nil {
        http.Error(w, "upstream error", http.StatusBadGateway)
        return
    }
    io.Copy(w, resp.Body)
}
""",
        "TypeScript": """
export function Page() {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setItems((prev) => [...prev, String(Date.now())]);
    }, 200);
    return () => {
      console.log("cleanup");
    };
  }, []);

  return <div>{items.length}</div>;
}
""",
        "Java": """
public void consume(Message msg) {
    try {
        service.handle(msg);
        offsetStore.commit(msg.getOffset());
    } catch (Exception ex) {
        log.warn("consume failed {}", msg.getId(), ex);
    }
}
""",
        "SQL": """
WITH shard_jobs AS (
  SELECT shard_id, payload_size, created_at
  FROM job_queue
  WHERE status = 'pending'
)
SELECT shard_id, AVG(payload_size) AS avg_payload, COUNT(*) AS cnt
FROM shard_jobs
GROUP BY shard_id
ORDER BY cnt DESC;
""",
        "Rust": """
pub async fn run_loop(rx: Receiver<Event>, sink: Arc<Mutex<Sink>>) {
    loop {
        if let Ok(event) = rx.recv().await {
            let mut guard = sink.lock().await;
            guard.write(event.serialize().as_bytes()).await.unwrap();
        }
    }
}
""",
        "Dockerfile": """
FROM python:3.11-slim
WORKDIR /app
COPY . .
HEALTHCHECK --interval=5s --timeout=1s CMD curl -f http://127.0.0.1:8080/healthz || exit 1
CMD ["python", "main.py"]
""",
    }
    return samples.get(language, samples["Python"]).strip()


def _debugging_log_sample(language: str) -> str:
    samples = {
        "Python": """
2026-04-17 14:02:11,145 INFO request_id=9f21 stream opened job_id=job-447
2026-04-17 14:02:12,009 WARNING request_id=9f21 client disconnected early
2026-04-17 14:02:42,771 WARNING request_id=9f21 queue size still growing queue=184
2026-04-17 14:03:11,333 ERROR request_id=9f21 task pending for 60s
""",
        "Go": """
ts=2026-04-17T14:02:11.145Z level=warn req_id=gw-18 upstream=profile-api latency_ms=2015 msg="upstream timeout"
ts=2026-04-17T14:02:11.146Z level=error req_id=gw-18 status=502 retryable=true msg="proxy failed"
ts=2026-04-17T14:02:11.148Z level=info req_id=gw-18 reused_conn=true inflight=187 msg="request done"
""",
        "TypeScript": """
[page] mount route=/reports
[page] cleanup skipped because timer ref missing
[page] listener count=14 after route change
[page] heapUsedMB=512 and growing
""",
        "Java": """
WARN  [consumer-7] order.reconcile - duplicate message detected msgId=9981 offset=713991
ERROR [consumer-7] order.reconcile - db write timeout for msgId=9981
WARN  [consumer-7] order.reconcile - message requeued without idempotency marker
""",
        "SQL": """
2026-04-17 14:02:11 shard=7 rows=50210 avg_payload=92144 elapsed_ms=1820
2026-04-17 14:02:14 shard=7 rows=50301 avg_payload=91872 elapsed_ms=1888
2026-04-17 14:02:16 shard=3 rows=812 avg_payload=1024 elapsed_ms=67
""",
        "Rust": """
2026-04-17T14:02:11Z WARN sink lock held for 184ms
2026-04-17T14:02:11Z WARN channel backlog=442
2026-04-17T14:02:12Z ERROR flush loop starved for 2.4s
""",
        "Dockerfile": """
container exited with code 0 before health endpoint became ready
healthcheck attempt=3 connect ECONNREFUSED 127.0.0.1:8080
readiness timeout after 15s
""",
    }
    return samples.get(language, samples["Python"]).strip()


def _debugging_stack_sample(language: str) -> str:
    samples = {
        "Python": """
Traceback (most recent call last):
  File "/srv/app/stream.py", line 81, in stream_response
    chunk = await queue.get()
  File "/usr/lib/python3.11/asyncio/queues.py", line 158, in get
    await getter
asyncio.exceptions.CancelledError
""",
        "Go": """
goroutine 2193 [running]:
net/http.(*reverseProxy).ServeHTTP(...)
    /usr/local/go/src/net/http/httputil/reverseproxy.go:481
main.proxyHandler(...)
    /app/gateway/proxy.go:63
""",
        "TypeScript": """
Warning: Can't perform a React state update on an unmounted component.
    at Page (Page.tsx:18:15)
    at RenderedRoute (react-router-dom.js:539)
""",
        "Java": """
java.sql.SQLTransientConnectionException: timeout while waiting for connection
    at com.example.repo.OrderRepo.save(OrderRepo.java:91)
    at com.example.service.ReconcileService.handle(ReconcileService.java:52)
    at com.example.consumer.OrderConsumer.consume(OrderConsumer.java:28)
""",
        "SQL": """
ERROR: syntax error at or near "AND"
LINE 9:         query := query || ' AND name LIKE ''%' || keyword || ...
""",
        "Rust": """
thread 'tokio-runtime-worker' panicked at 'called `Result::unwrap()` on an `Err` value: BrokenPipe', src/loop.rs:18:61
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
""",
        "Dockerfile": """
OCI runtime create failed: container_linux.go:380: starting container process caused:
exec: "curl": executable file not found in $PATH
""",
    }
    return samples.get(language, samples["Python"]).strip()


def _build_rag_instruction(topic: str, target_length: int) -> str:
    seed = (
        f"你是一名企业知识库助手。请基于以下多段检索材料，围绕“{topic}”回答最后的问题。"
        "要求：1. 只基于给定材料作答 2. 明确指出关键信息来自哪一段资料 3. 若材料之间有冲突，需要先比较再给结论 "
        "4. 输出应包含结论、证据、风险、后续建议四部分。"
    )
    detail_block = (
        f"资料A：围绕 {topic} 的产品背景、版本沿革、现网使用比例、SLO 目标和历史事故复盘展开。"
        "资料B：给出三个团队的执行口径差异，包括研发、运维、业务侧对优先级、稳定性、成本的不同判断。"
        "资料C：补充一组线上样本日志摘要，包含延迟高峰、报错码分布、回滚窗口、恢复时长、二次验证结果。"
        "资料D：提供一份较新的变更说明，包括发布窗口、配置调整、并发限制、缓存策略、重试策略和告警阈值。"
        "最终问题：请整合全部资料，判断当前最可能的风险点、最值得优先验证的假设，以及若只能做一轮压测应如何设计最小实验。"
    )
    return _expand_to_length(seed, detail_block, target_length)


def _build_coding_instruction(task: str, language: str, target_length: int) -> str:
    seed = (
        f"你是一名资深 {language} 工程师。请完成任务“{task}”。"
        "要求直接给出可运行实现，并在代码前用简短文字说明设计思路。"
        "输出必须覆盖：接口定义、边界条件、复杂度分析、核心测试用例、潜在失败场景、必要的异常处理。"
    )
    detail_block = (
        f"功能背景：该任务属于线上服务中的核心模块，代码需要兼顾可维护性与性能。"
        f"实现要求：围绕 {task} 明确输入输出结构、非法输入处理、并发或异步场景下的行为、日志与监控埋点建议。"
        "测试要求：至少考虑空输入、极端大输入、重复调用、超时、重试、部分失败、资源释放、回归兼容。"
        "重构要求：如果需要拆分函数，请说明每个函数的职责；如果选择类设计，请说明状态管理和线程安全问题。"
        "交付要求：最后补一段 code review 视角的自检，指出最容易被忽略的缺陷、性能瓶颈、API 设计风险和后续优化项。"
    )
    return _expand_to_length(seed, detail_block, target_length)


def _build_code_editing_instruction(task: str, language: str, target_length: int) -> str:
    source_block = _code_fence(language, _editing_code_sample(language))
    seed = (
        f"你是一名资深 {language} 工程师。下面有一段已有代码，请围绕“{task}”完成定向修改。"
        "要求你基于现有实现给出修改后的完整代码，并说明修改点、兼容性影响和回归风险。\n\n"
        "现有代码如下：\n"
        f"{source_block}"
    )
    detail_block = (
        f"任务背景：上面的代码与“{task}”直接相关，已经在线上运行一段时间。"
        "请把已有实现当成真实存量代码处理，不要完全推倒重写。"
        "代码中存在 2 到 4 个容易出错的细节，例如共享可变状态、缺少超时控制、空值处理不一致、日志上下文丢失、异步取消未清理资源。"
        "修改要求：必须尽量保持原有接口不变，优先做最小侵入式修复；如果必须重构，需解释拆分依据。"
        "输出要求：1. 给出修订后的完整实现 2. 列出关键 diff 说明 3. 给出最少 5 条回归测试用例 4. 说明最可能的兼容性风险。"
        "附加约束：请在代码中保留必要注释，但不要过度解释；请特别注意线程安全、资源释放、异常可观测性和幂等性。"
    )
    return _expand_to_length(seed, detail_block, target_length)


def _build_code_debugging_instruction(task: str, language: str, target_length: int) -> str:
    source_block = _code_fence(language, _debugging_code_sample(language))
    log_block = _code_fence("text", _debugging_log_sample(language))
    stack_block = _code_fence("text", _debugging_stack_sample(language))
    seed = (
        f"你是一名资深 {language} 工程师。下面给你一组真实故障信息，请围绕“{task}”完成排查和修复。"
        "输入包含报错堆栈、日志片段、配置片段和部分相关源码。请先定位根因，再给出修复方案与补丁代码。\n\n"
        "相关代码：\n"
        f"{source_block}\n\n"
        "日志片段：\n"
        f"{log_block}\n\n"
        "报错或堆栈：\n"
        f"{stack_block}"
    )
    detail_block = (
        f"故障线索：当前异常与“{task}”有关，线上表现为偶发失败、长尾延迟上升或资源不释放。"
        "请把上面的日志、堆栈和源码当成一次真实事故的核心证据，不要忽略时间线和上下游关系。"
        "排查要求：区分直接错误和诱发错误，说明为什么某些看起来可疑的线索不是根因。"
        "修复要求：给出最小可行修复，同时说明是否需要增加监控、熔断、重试保护、输入校验或资源隔离。"
        "输出要求：1. 根因分析 2. 修复后的关键代码 3. 验证方案 4. 预防再次发生的工程措施。"
    )
    return _expand_to_length(seed, detail_block, target_length)


def _build_long_context_analysis_instruction(topic: str, target_length: int) -> str:
    seed = (
        f"你是一名资深分析师。请阅读以下超长资料，并围绕“{topic}”完成一份结构化分析报告。"
        "要求报告至少包含：事实摘要、时间线、矛盾点、关键决策、数据证据、风险判断、建议动作、需要继续验证的问题。"
    )
    detail_block = (
        f"资料段1：包含项目背景、历史决策记录、版本说明和关键指标趋势。"
        f"资料段2：包含多轮会议纪要、讨论分歧、责任划分、资源约束和上线窗口。"
        f"资料段3：包含日志摘要、监控告警、容量变化、用户反馈、工单处理和回滚记录。"
        "资料段4：包含业务影响评估、财务约束、合规提醒、异常说明和下一阶段目标。"
        "最终分析要求：请给出清晰的优先级排序，并说明为什么某些问题应该立即处理，某些问题可以延后观察。"
    )
    return _expand_to_length(seed, detail_block, target_length)


def _build_rag_rows() -> list[dict[str, str]]:
    topics = [
        ("企业知识库问答的证据归因", 4800),
        ("多来源文档冲突下的事实判定", 5600),
        ("RAG 系统上线前的压测口径", 6400),
        ("客服知识库版本切换风险", 7200),
        ("运营手册与产品文档不一致时的回答策略", 8400),
        ("检索结果冗余对回答质量与延迟的影响", 9600),
        ("内部制度问答中的时效性冲突", 10800),
        ("跨团队知识库整合后的验证方案", 12000),
    ]
    return [{"instruction": _build_rag_instruction(topic, target)} for topic, target in topics]


def _build_code_generation_rows() -> list[dict[str, str]]:
    tasks = [
        ("实现支持 TTL 的 LRU 缓存，并补全单元测试", "Python", 3200),
        ("修复 FastAPI 流式接口在客户端取消连接时的资源泄漏", "Python", 3800),
        ("实现一个带指数退避和抖动的异步重试装饰器", "Python", 4200),
        ("为 React 表格组件实现服务端分页、排序和空态处理", "TypeScript", 3600),
        ("重构日志解析器，使其支持增量读取和异常行隔离", "Python", 4400),
        ("编写一个 SQL 去重任务，要求支持批量幂等执行", "SQL", 4000),
        ("实现高并发下载器，要求支持限速、断点续传和失败重试", "Go", 5200),
        ("为配置中心客户端补上本地缓存和热更新监听", "TypeScript", 4800),
        ("实现一个可观测的任务队列，包含指标埋点和死信队列处理", "Python", 5600),
        ("重写旧版 Dockerfile，优化镜像层、缓存和启动速度", "Dockerfile", 3000),
        ("实现代码搜索结果排序逻辑，兼顾相关性与性能", "TypeScript", 4600),
        ("修复一个多线程写文件竞态问题，并给出最小复现测试", "Java", 5400),
        ("为 webhook 消费器实现签名校验、去重和重放保护", "Python", 5000),
        ("实现一个 Markdown 解析流水线，要求支持插件扩展", "Rust", 6200),
        ("为大模型网关实现请求限流、中断取消和超时回收", "Go", 7000),
        ("补一套针对代码生成接口的回归测试，覆盖流式输出和错误分支", "Python", 4500),
    ]
    return [{"instruction": _build_coding_instruction(task, language, target)} for task, language, target in tasks]


def _build_code_editing_rows() -> list[dict[str, str]]:
    tasks = [
        ("修复 FastAPI SSE 接口在客户端断开后的资源清理逻辑", "Python", 5200),
        ("重构 React 表单状态管理，消除重复渲染和竞态更新", "TypeScript", 5600),
        ("为缓存客户端补上并发安全和过期淘汰的边界处理", "Go", 6200),
        ("修改任务队列消费者，避免重复消费和死信遗漏", "Python", 6800),
        ("修复 SQL 构造逻辑中的条件拼接错误并补回归测试", "SQL", 5000),
        ("重构日志聚合器，使其支持增量 flush 和失败隔离", "Rust", 7200),
        ("为网关限流模块补充取消传播和超时释放机制", "Go", 7600),
        ("在 Docker 构建脚本中移除无效层并保留缓存命中", "Dockerfile", 4600),
        ("调整 webhook 处理器的签名校验和重放保护实现", "Python", 6400),
        ("修复 Markdown 渲染管线中的插件顺序问题和 XSS 风险", "TypeScript", 7000),
    ]
    return [{"instruction": _build_code_editing_instruction(task, language, target)} for task, language, target in tasks]


def _build_code_debugging_rows() -> list[dict[str, str]]:
    tasks = [
        ("定位异步任务取消后仍持续占用连接池的问题", "Python", 5600),
        ("排查高并发下偶发 502 的真实根因并修复", "Go", 6200),
        ("分析 React 页面切换后内存不释放的原因", "TypeScript", 5400),
        ("排查重复消费导致账务对账失败的问题", "Java", 6800),
        ("定位 SSE 流式输出偶发卡死的触发条件", "Python", 6000),
        ("分析 webhook 请求被误判为重放攻击的原因", "Python", 5800),
        ("定位缓存穿透导致数据库尖峰的链路瓶颈", "Go", 7000),
        ("分析 Docker 容器启动后健康检查间歇失败的问题", "Dockerfile", 5000),
        ("排查 SQL 批处理在部分分片下吞吐异常下降的问题", "SQL", 6400),
        ("定位日志聚合线程偶发阻塞并拖慢主链路的原因", "Rust", 7600),
    ]
    return [{"instruction": _build_code_debugging_instruction(task, language, target)} for task, language, target in tasks]


def _build_long_context_analysis_rows() -> list[dict[str, str]]:
    topics = [
        ("跨季度性能复盘与容量趋势判断", 12000),
        ("多团队协同发布后的稳定性排查", 16000),
        ("长链路线上事故时间线重建", 20000),
        ("模型网关成本与体验的综合分析", 24000),
        ("RAG 系统多轮变更后的行为对照", 28000),
        ("复杂项目的里程碑、风险和责任归因分析", 32000),
    ]
    return [{"instruction": _build_long_context_analysis_instruction(topic, target)} for topic, target in topics]


def _write_jsonl_rows(path: Path, rows: list[dict[str, str]]) -> None:
    content = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n"
    path.write_text(content, encoding="utf-8")


def _write_json_rows(path: Path, rows: list[dict[str, str]]) -> None:
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_builtin_datasets(root: Path) -> dict[str, Path]:
    root.mkdir(parents=True, exist_ok=True)

    writers: dict[str, tuple[Path, callable[[], list[dict[str, str]]], callable[[Path, list[dict[str, str]]], None]]] = {
        "openqa": (root / OPENQA_FILE, _build_openqa_rows, _write_jsonl_rows),
        "longalpaca": (root / LONGALPACA_FILE, _build_longalpaca_rows, _write_json_rows),
        "chat_short": (root / CHAT_SHORT_FILE, _build_chat_short_rows, _write_jsonl_rows),
        "rag_medium_context": (root / RAG_MEDIUM_CONTEXT_FILE, _build_rag_rows, _write_json_rows),
        "code_generation": (root / CODE_GENERATION_FILE, _build_code_generation_rows, _write_json_rows),
        "code_editing": (root / CODE_EDITING_FILE, _build_code_editing_rows, _write_json_rows),
        "code_debugging": (root / CODE_DEBUGGING_FILE, _build_code_debugging_rows, _write_json_rows),
        "long_context_analysis": (root / LONG_CONTEXT_ANALYSIS_FILE, _build_long_context_analysis_rows, _write_json_rows),
    }

    resolved: dict[str, Path] = {}
    for alias, (path, builder, writer) in writers.items():
        if not path.exists():
            writer(path, builder())
        resolved[alias] = path

    return resolved
