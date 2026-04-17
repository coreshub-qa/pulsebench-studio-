# PulseBench Studio Agent 模式开发清单

## 1. 目标

本清单用于把 `Agent 模式` 从设计稿拆成可执行开发任务。

## 2. Phase 1：最小可用版本

### 2.1 后端 schema

- [ ] 在 `backend/schemas.py` 新增 `AgentStrategyRequest`
- [ ] 新增 `AgentStrategyRun`
- [ ] 新增 `AgentStrategyDraft`
- [ ] 新增 `AgentStrategyResponse`
- [ ] 新增 `AgentExecuteRequest`
- [ ] 扩展 `BatchCreateRequest.mode` 支持 `agent`
- [ ] 扩展 `BatchRuntime.mode` 支持 `agent`
- [ ] 扩展 `BatchManifest.mode` 支持 `agent`

### 2.2 后端服务

- [ ] 新增 `backend/agent_service.py`
- [ ] 实现输入标准化
- [ ] 实现 guardrails 生成
- [ ] 实现 prompt context 拼装
- [ ] 实现 LLM 结果解析
- [ ] 实现 JSON/schema 校验
- [ ] 实现 `draft_to_batch_request`

### 2.3 后端接口

- [ ] 在 `backend/app.py` 增加 `POST /api/agent/strategy`
- [ ] 在 `backend/app.py` 增加 `POST /api/agent/strategy/execute`
- [ ] 统一错误返回格式
- [ ] 为新接口补充日志

### 2.4 前端类型与 API

- [ ] 在 `frontend/src/lib/types.ts` 新增 agent 相关类型
- [ ] 在 `frontend/src/lib/api.ts` 新增 `planAgentStrategy`
- [ ] 在 `frontend/src/lib/api.ts` 新增 `executeAgentStrategy`

### 2.5 前端页面

- [ ] 新增 `frontend/src/pages/AgentModePage.tsx`
- [ ] 支持已知信息输入
- [ ] 支持生成策略
- [ ] 支持显示策略草案
- [ ] 支持直接执行
- [ ] 执行后跳转 `/batch/:batchId`

### 2.6 路由与导航

- [ ] 在 `frontend/src/App.tsx` 注册 `/agent`
- [ ] 在 `HomePage.tsx` 新增 Agent 入口卡片
- [ ] 在 `LayoutShell.tsx` 新增导航项
- [ ] 为 Agent 页面补充顶部 meta 文案

### 2.7 V1 验收

- [ ] 能生成至少 1 条合法 run
- [ ] 草案能成功创建 batch
- [ ] Agent 批次能在现有实时页正常运行
- [ ] 批次报告链路不报错

## 3. Phase 2：编辑与复用

### 3.1 通用矩阵编辑

- [ ] 从 `TemplateModePage.tsx` 抽取 `MatrixEditor`
- [ ] Agent 草案支持编辑并发列表
- [ ] Agent 草案支持编辑请求数列表
- [ ] Agent 草案支持编辑输入输出长度
- [ ] Agent 草案支持修改标签和目标说明

### 3.2 草案交互增强

- [ ] 增加 `重新生成`
- [ ] 增加 `应用到可编辑矩阵`
- [ ] 增加策略置信度展示
- [ ] 增加假设与风险提示展示

### 3.3 历史与详情

- [ ] 历史页识别 `agent` 来源批次
- [ ] 批次详情展示策略摘要
- [ ] 批次详情展示假设和风险

## 4. Phase 3：闭环增强

### 4.1 结果驱动

- [ ] 跑完后生成下一轮建议
- [ ] 支持“基于当前结果再规划一轮”
- [ ] 将 report 摘要作为 Agent 新输入

### 4.2 模板沉淀

- [ ] Agent 草案支持另存为模板
- [ ] 模板增加 `source=agent`
- [ ] 支持团队复用

### 4.3 策略校准

- [ ] 根据历史相似模型结果做策略修正
- [ ] 对不同目标采用不同默认 aggressiveness
- [ ] 增加更细的硬件层级判断

## 5. 技术风险

- [ ] LLM 输出不稳定，需做好 schema 校验
- [ ] `agent` 模式扩展后需检查 batch 报告兼容性
- [ ] 前端如果复制模板页逻辑过多，后续维护成本会上升
- [ ] 历史和详情页需确认 `mode` 扩展不会导致显示分支遗漏

## 6. 推荐开发顺序

1. 先做后端 schema 和策略接口
2. 再做前端最小页面和直接执行
3. 跑通整条链路后，再补矩阵编辑
4. 最后再做历史、沉淀模板和闭环增强

## 7. Definition of Done

- [ ] 代码可构建
- [ ] Agent 草案可生成
- [ ] Agent 草案可执行
- [ ] batch 运行链路可复用
- [ ] 历史与报告页无明显回归
- [ ] README 或 docs 中已有 Agent 模式说明
