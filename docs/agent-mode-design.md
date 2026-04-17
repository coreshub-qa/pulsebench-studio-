# PulseBench Studio Agent 模式设计稿

## 1. 目标

### 1.1 产品目标

在保留现有三种入口的前提下，新增第四种入口 `Agent 模式`：

- 用户输入已知信息，或从少量必要选项中选择
- 系统调用 AI 生成一份结构化测试策略草案
- 用户可以审阅、修改、接受或拒绝
- 确认后自动创建 batch 并开始执行

一句话定义：

**Agent 模式不是替用户黑箱决策，而是把专业测试策略先搭出来，再由用户拍板执行。**

### 1.2 解决的问题

当前产品已经有：

- `一键体检`：输入最少，适合快速验活
- `场景模板`：适合标准化矩阵测试
- `高级自定义`：适合深度调参和复现实验

缺口在于：

- 很多用户知道“要测”，但不知道该选哪个模板
- 用户知道模型和硬件，但不会把它转成合理矩阵
- 用户能看懂测试结果，但不一定会设计首轮实验

Agent 模式要补的是这段空白。

## 2. 核心原则

### 2.1 非黑箱

- AI 不能默认直接执行
- 必须先展示可审阅策略
- 每一条 run 必须能落成现有 `RunSpec`

### 2.2 规则优先，LLM 增强

策略生成必须由两部分组成：

- 规则引擎负责边界、合法性、默认区间和兜底
- LLM 负责组合策略、解释理由、处理信息不全

不采用“纯大模型自由输出矩阵”的方案。

### 2.3 复用现有执行链路

Agent 模式只负责“规划”，执行仍复用现有：

- `RunSpec`
- `BatchRunConfig`
- `BatchCreateRequest`
- `/api/batches`

这样可以降低实现复杂度和回归风险。

### 2.4 用户保留决策权

用户必须可以：

- 重新生成策略
- 在执行前修改矩阵
- 查看 AI 假设与风险提示

## 3. 用户画像与适用场景

### 3.1 目标用户

- 会部署推理服务，但不熟悉压测方法的人
- 知道模型和硬件，但不确定首轮实验怎么设计的人
- 希望快速得到“接近最佳实践”的测试草案的人

### 3.2 适用场景

- 新模型刚接入，需要快速生成首轮方案
- 团队成员想做标准测试，但不熟悉各模板差异
- 非性能专家希望得到保守但合理的起始矩阵

### 3.3 不适用场景

- 用户已经明确知道自己要跑什么
- 需要极端非标准验证
- 需要细粒度控制所有底层参数

这类情况仍应优先使用 `高级自定义`。

## 4. 信息架构

### 4.1 新增入口

首页新增第四张卡片：

- 标题：`Agent 模式`
- 路径：`/agent`
- 核心文案：`输入已知条件，由 AI 生成测试策略草案`

同步修改：

- [frontend/src/pages/HomePage.tsx](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/frontend/src/pages/HomePage.tsx:1)
- [frontend/src/components/LayoutShell.tsx](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/frontend/src/components/LayoutShell.tsx:1)
- [frontend/src/App.tsx](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/frontend/src/App.tsx:1)

### 4.2 页面结构

新增页面：

- `frontend/src/pages/AgentModePage.tsx`

页面分为四个区块：

1. `测试目标`
2. `服务与环境`
3. `负载画像`
4. `策略草案`

### 4.3 页面状态

页面至少包含以下状态：

- `idle`
- `validating`
- `planning`
- `planned`
- `executing`
- `error`

## 5. 用户流程

### 5.1 主流程

1. 用户进入 `Agent 模式`
2. 填写已知信息
3. 点击 `生成策略`
4. 后端校验并生成结构化策略草案
5. 前端展示：
   - 总体判断
   - 推荐模板基型
   - 推荐矩阵
   - 假设与风险
6. 用户选择：
   - `直接执行`
   - `应用到可编辑矩阵`
   - `重新生成`
7. 确认后创建 batch，跳转批次运行页

### 5.2 次流程：应用到可编辑矩阵

用户点击 `应用到可编辑矩阵` 后：

- 使用与模板页相同的矩阵编辑 UI
- 允许修改并发列表、请求数、输入输出长度、dataset
- 最终仍通过 `/api/batches` 执行

这个动作的意义是把 Agent 模式和模板体系打通，而不是形成独立孤岛。

## 6. 输入设计

### 6.1 必填输入

V1 建议最少要求以下字段：

- `goal`：测试目标
- `model`：模型名称
- `url`：API 地址

### 6.2 推荐输入

为了提高策略质量，建议提供但不强制：

- `parameterScale`：参数量
- `contextWindow`：上下文窗口
- `gpuModel`：GPU 型号
- `gpuCount`：GPU 数量
- `gpuMemoryGb`：单卡显存
- `engine`：推理引擎
- `quantization`：量化方式
- `tokenizerPath`：tokenizer 路径
- `workloadType`：负载类型
- `typicalPromptLength`：典型输入长度
- `typicalOutputLength`：典型输出长度
- `stream`：是否流式返回
- `timeBudget`：实验预算
- `aggressiveness`：保守/均衡/激进

### 6.3 测试目标选项

`goal` 建议限制为枚举值：

- `health_check`
- `interactive_experience`
- `balanced_throughput`
- `long_context`
- `capacity_limit`

### 6.4 负载类型选项

`workloadType` 建议限制为：

- `chat_short`
- `chat_long_output`
- `rag_medium_context`
- `long_context_analysis`
- `code_generation`
- `unknown`

## 7. Agent 输出设计

Agent 输出不能只是自然语言。必须包含结构化草案和解释。

### 7.1 输出组成

输出对象包含：

- `summary`
- `strategyType`
- `confidence`
- `assumptions`
- `warnings`
- `focusMetrics`
- `recommendedRuns`
- `batchDraft`

### 7.2 推荐 run 结构

每个 run 至少包含：

- `label`
- `objective`
- `spec`

其中 `spec` 必须可直接映射到现有 `RunSpec`。

### 7.3 batchDraft

`batchDraft` 的目标是可直接转成现有 `BatchCreateRequest`，包含：

- `templateId`
- `mode`
- `title`
- `runs`

`templateId` 在 Agent 模式下可以使用一个专用值，例如：

- `agent_generated`

这样在历史和批次详情里可以识别来源。

## 8. 策略生成逻辑

### 8.1 总体流程

后端策略生成分为四步：

1. 输入标准化
2. 规则引擎推导 guardrails
3. LLM 生成策略草案
4. 结构化校验与修正

### 8.2 输入标准化

标准化要处理：

- 空值转 `None`
- 字段别名统一
- 数字字段转数值
- 无效范围过滤
- 文本 trim

### 8.3 规则引擎职责

规则引擎负责以下工作：

- 根据 `goal` 选择基础模板族
- 根据 `contextWindow` 限制 `maxPromptLength`
- 根据 `goal` 限制推荐并发区间
- 根据 `workloadType` 给出输入输出长度默认值
- 根据 `gpuModel/gpuCount/engine/quantization` 给出保守并发层级
- 如果信息不足，则生成保守策略边界
- 保证 `parallel` 和 `number` 的长度一致
- 保证数值大于 0

### 8.4 LLM 职责

LLM 负责：

- 在 guardrails 内组合完整策略
- 解释为什么是这个策略
- 给出关键假设和风险
- 当信息不足时明确指出边界

### 8.5 V1 不做的事情

V1 不做：

- 自动读取服务端真实硬件状态
- 根据历史结果自动学习策略
- 多轮追问式对话 agent
- 自动生成复杂自定义 dataset

## 9. 策略映射规则

### 9.1 模板基型映射

建议先做一层模板基型，而不是让 LLM 完全自由发挥：

| goal | 模板基型 |
| --- | --- |
| `health_check` | quick_check |
| `interactive_experience` | short_text_experience |
| `balanced_throughput` | balanced_throughput |
| `long_context` | long_context_capability |
| `capacity_limit` | capacity_pressure |

说明：

- Agent 输出不必和现有模板一模一样
- 但应复用这些模板的思路作为起点

### 9.2 并发策略建议

V1 不追求精确估算，只分层建议：

- `conservative`
  - 低并发点，优先稳定
- `balanced`
  - 中等覆盖，优先信息增量
- `aggressive`
  - 更快逼近容量边界

### 9.3 请求数策略建议

请求数不单独估算，优先和并发点成比例：

- 低并发：保持最少样本验证
- 中并发：提高样本稳定性
- 高并发：保证足够请求数，避免偶然波动

## 10. 后端设计

### 10.1 新增 schema

在 [backend/schemas.py](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/backend/schemas.py:1) 新增以下模型：

- `AgentGoal`
- `AgentWorkloadType`
- `AgentAggressiveness`
- `AgentStrategyRequest`
- `AgentGuardrails`
- `AgentStrategyRun`
- `AgentStrategyDraft`
- `AgentStrategyResponse`
- `AgentExecuteRequest`

### 10.2 推荐 schema 草案

```python
class AgentStrategyRequest(BaseModel):
    goal: Literal[
        "health_check",
        "interactive_experience",
        "balanced_throughput",
        "long_context",
        "capacity_limit",
    ]
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
    workload_type: str | None = Field(default="unknown", alias="workloadType")
    typical_prompt_length: int | None = Field(default=None, alias="typicalPromptLength")
    typical_output_length: int | None = Field(default=None, alias="typicalOutputLength")
    stream: bool | None = True
    time_budget: str | None = Field(default=None, alias="timeBudget")
    aggressiveness: Literal["conservative", "balanced", "aggressive"] = "balanced"
```

```python
class AgentStrategyRun(BaseModel):
    label: str
    objective: str
    reasoning: str
    spec: RunSpec
```

```python
class AgentStrategyDraft(BaseModel):
    template_id: str = Field(alias="templateId")
    mode: Literal["agent"]
    title: str
    summary: str
    strategy_type: str = Field(alias="strategyType")
    confidence: Literal["low", "medium", "high"]
    assumptions: list[str]
    warnings: list[str]
    focus_metrics: list[str] = Field(alias="focusMetrics")
    runs: list[AgentStrategyRun]
```

```python
class AgentStrategyResponse(BaseModel):
    request: AgentStrategyRequest
    draft: AgentStrategyDraft
    guardrails: dict[str, Any]
```

### 10.3 新增接口

在 [backend/app.py](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/backend/app.py:1) 新增：

- `POST /api/agent/strategy`
- `POST /api/agent/strategy/execute`

#### `/api/agent/strategy`

输入：

- `AgentStrategyRequest`

输出：

- `AgentStrategyResponse`

用途：

- 生成结构化策略草案

#### `/api/agent/strategy/execute`

输入：

- `AgentStrategyDraft`

输出：

- `BatchManifest`

用途：

- 将已确认草案转换为 `BatchCreateRequest`
- 调用现有 `manager.create_batch`

### 10.4 新增服务文件

建议新增：

- `backend/agent_service.py`

职责拆分：

- `normalize_agent_request`
- `build_agent_guardrails`
- `build_agent_prompt_context`
- `generate_agent_strategy`
- `validate_agent_strategy`
- `draft_to_batch_request`

### 10.5 失败处理

如果 LLM 返回内容不合法：

1. 先尝试 JSON 修复
2. 再做 schema 校验
3. 若仍失败，则返回明确错误，不自动生成伪草案

错误信息必须可读，例如：

- `AI 已返回内容，但未通过策略结构校验`
- `无法根据当前输入生成安全策略，请补充 tokenizerPath 或上下文窗口`

## 11. Prompt 设计

### 11.1 System Prompt 目标

新增一套专用 `Agent Strategy Planner` system prompt，不复用现有报告分析 prompt。

它必须明确：

- 你是推理服务测试策略规划器
- 任务是生成结构化测试草案
- 必须输出 JSON
- 不允许编造超出输入边界的能力
- 不允许输出不合法矩阵
- 信息不足时必须保守

### 11.2 User Prompt 内容

User Prompt 由三部分构成：

1. `normalized_request`
2. `guardrails`
3. `output_schema`

### 11.3 输出约束

LLM 输出必须满足：

- `runs` 不能为空
- 每个 `spec.parallel` 和 `spec.number` 长度一致
- `dataset=random` 时，若需要 tokenizer，则必须有 `tokenizerPath`
- `maxPromptLength` 不得超过 `contextWindow`
- 不生成明显异常的大并发和长输出组合

### 11.4 推荐输出格式

建议优先让模型输出 JSON，不使用 Markdown 混排。

原因：

- 便于前端直接渲染
- 便于后端做 schema 校验
- 便于未来保存草案历史

## 12. 前端设计

### 12.1 新增类型

在 [frontend/src/lib/types.ts](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/frontend/src/lib/types.ts:1) 新增：

- `AgentStrategyRequest`
- `AgentStrategyDraft`
- `AgentStrategyResponse`

### 12.2 新增 API

在 [frontend/src/lib/api.ts](/Users/zhanglinsen/Documents/AIGC/项目/推理服务性能测试工具/pulsebench-studio/frontend/src/lib/api.ts:1) 新增：

- `planAgentStrategy(payload)`
- `executeAgentStrategy(draft)`

### 12.3 页面交互

`AgentModePage.tsx` 推荐布局：

- 左侧表单区
- 右侧策略草案区

#### 左侧表单区

包含：

- 测试目标
- 模型与服务
- 硬件与引擎
- 负载画像
- 策略偏好

#### 右侧策略草案区

包含：

- 策略摘要
- 推荐目标
- 推荐矩阵
- 关注指标
- 假设与风险

### 12.4 动作按钮

页面主按钮分三类：

- `生成策略`
- `应用到可编辑矩阵`
- `直接执行`

### 12.5 可编辑矩阵实现

V1 推荐不要新做一套复杂矩阵编辑器，直接复用 `TemplateModePage` 的矩阵块形态。

推荐抽取：

- `MatrixEditor`

供以下页面共用：

- `TemplateModePage`
- `AgentModePage`

### 12.6 首页与导航文案

首页新增卡片建议文案：

- 标题：`Agent 模式`
- kicker：`智能规划`
- description：`输入已知条件，由 AI 生成结构化测试策略草案。`
- audience：`不确定怎么开始，但希望快速得到合理方案`

侧边导航新增：

- `Agent 模式`
- desc：`根据目标与环境生成策略草案`
- action：`审阅并执行`

## 13. 状态与数据流

### 13.1 前端状态流

```text
idle
  -> validating
  -> planning
  -> planned
  -> executing
  -> batch live
```

### 13.2 后端状态流

```text
AgentStrategyRequest
  -> normalize
  -> build guardrails
  -> LLM plan
  -> schema validate
  -> AgentStrategyResponse
  -> user confirm
  -> draft_to_batch_request
  -> manager.create_batch
```

## 14. 数据兼容与历史归档

### 14.1 与现有 batch 的兼容

Agent 模式不新增单独执行体系，统一写入现有 batch 目录。

建议在 batch request 中保留：

- `templateId = agent_generated`
- `mode = agent`

如果现有 `BatchCreateRequest.mode` 只支持 `quick_check | template`，需要扩展为：

- `quick_check`
- `template`
- `agent`

### 14.2 历史页展示

历史页至少要能识别：

- 这是 Agent 生成批次
- 批次标题来自 AI 草案还是用户手动修改

建议在批次详情页展示：

- 策略摘要
- 假设
- 风险提示

## 15. 验收标准

### 15.1 功能验收

- 用户可以进入 `Agent 模式`
- 用户可以生成结构化策略草案
- 草案可审阅、可修改、可执行
- 执行后进入现有批次运行链路

### 15.2 质量验收

- 不合法草案不会被执行
- 策略草案 100% 可映射为合法 `RunSpec`
- 信息不足时能给出保守草案，而不是胡乱给高并发

### 15.3 体验验收

- 首次用户 1 分钟内可生成第一份草案
- 生成后无需重新输入连接信息
- 页面上能清楚看到 AI 的假设和风险

## 16. V1 范围

V1 只做：

- 单页表单
- 单次策略生成
- 草案审阅
- 草案转 batch 执行

V1 不做：

- 多轮对话式 agent
- 自动硬件探测
- 历史数据驱动策略学习
- 保存为团队模板

## 17. V2 方向

V2 可以继续扩展：

- 结果驱动下一轮策略
- 一键保存 Agent 草案为模板
- 根据历史同模型结果做策略校准
- 自动追问 1 到 2 个关键问题
- 按目标输出“最小验证计划”和“完整验证计划”

## 18. 推荐实施路径

### Phase 1

- 新增 schema
- 新增 `/api/agent/strategy`
- 新增 `/api/agent/strategy/execute`
- 新增 `AgentModePage`
- 新增首页入口和导航入口

### Phase 2

- 抽取通用 `MatrixEditor`
- 支持策略草案编辑
- 历史页识别 `agent` 批次

### Phase 3

- 跑完自动生成下一轮建议
- 保存为模板
- 基于历史结果做策略校准

## 19. 最终结论

Agent 模式最合理的落地方式不是“AI 替用户做决定”，而是：

**用户给目标和已知条件，系统用规则兜底，AI 生成可审阅的结构化策略，用户确认后复用现有 batch 体系执行。**

这样有四个好处：

- 复用现有架构，落地成本低
- 不会把执行链路搞成两套系统
- 用户有控制权，不是黑箱
- 后续很容易继续升级成“结果驱动下一轮实验”的闭环能力
