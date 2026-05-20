# 前端对接契约（AI 可读）

```yaml
scope: Web/移动端调用本仓库 FastAPI 后端
base_url_example: http://127.0.0.1:8001
note: BASE_URL 以实际部署为准；下文用 {BASE} 表示
openapi: "{BASE}/openapi.json"
```

## A. 环境与前缀

| 变量/项 | 说明 |
|---------|------|
| `{BASE}` | API 根，无尾部 `/` |
| API 路由前缀 | 绝大多数业务接口为 `/api/...` |
| 后端 `CORS_ORIGINS` | 逗号分隔；浏览器前端必须被包含，否则跨域失败 |
| 前端典型 env | `VITE_API_BASE_URL` 或等价物，值为 `{BASE}` |

## B. 鉴权（HTTP Headers）

| 场景 | Header | 值格式 |
|------|--------|--------|
| 已登录 | `Authorization` | `Bearer <JWT>` |
| 已登录且服务端配置了 `API_KEY` | 同上 + `X-API-Key` | 与服务器环境变量一致 |
| 匿名拉取某会话消息 | `X-Anonymous-Session` | 等于该会话的 `anonSessionSecret` |

**规则**：`API_KEY` 非空时，受保护路由必须同时带有效 JWT（若该路由要求登录）及正确 `X-API-Key`（以 OpenAPI 各路由为准）。

## C. 认证端点（摘要）

| Method | Path | 需登录 | 说明 |
|--------|------|--------|------|
| POST | `/api/auth/register` | 否 | body: username, password |
| POST | `/api/auth/login` | 否 | 返回 `access_token` |
| GET | `/api/auth/me` | 是 | 当前用户 |

完整字段见 OpenAPI。

## D. 流式对话 SSE（核心）

### D.1 请求

| 项 | 值 |
|----|-----|
| Method | `POST` |
| Path | `/api/chat` |
| Content-Type | `application/json` |
| 鉴权 | 可选；无 Bearer 则为匿名会话 |

**Body JSON（ChatRequest）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户输入 |
| `history` | array | 否 | 仅新建会话首轮可参考；有 `conversation_id` 后以 DB 为准 |
| `conversation_id` | string \| null | 否 | 续聊 |
| `agent_id` | string \| null | 否 | 指定 Agent |
| `anon_session_secret` | string \| null | 条件 | 匿名续聊时必填，与首包 meta 一致 |

### D.2 响应形态

| 项 | 值 |
|----|-----|
| Content-Type | `text/event-stream` |
| 行协议 | 多行 `data: <JSON>`，每行以 `\n\n` 结束；最后一帧为 `data: [DONE]\n\n` |

**解析算法（必须按序）**

1. 按 `\n\n` 分帧（SSE 事件帧）。
2. 对每帧中以 `data: ` 开头的行，取前缀后内容；若为 `[DONE]` 则结束。
3. 其余为 JSON 字符串，解析对象后读 `type` 字段分支处理。
4. 同一连接内 `type` 可能出现多次（如多个 `text-delta`）。

### D.3 SSE 事件对象（`type` 枚举）

所有事件均为 JSON 对象，且含字段 `type`。下表为**约定集合**（后端 `app/chat/services/streaming/` 发出，以代码为准）：

| type | 必填字段 | 可选字段 | 语义 |
|------|-----------|-----------|------|
| `notice` | `safetyNotice` | — | 流开始时的安全提示（前端可无专门分支） |
| `meta` | `conversationId`, `safetyNotice` | `agentId`, `chatModel`, `anonSessionSecret` | 会话元数据；匿名首包含 `anonSessionSecret` |
| `text-delta` | `textDelta` | — | 助手正文增量 |
| `thinking-delta` | `textDelta` | — | 思考/推理增量（展示用；**不落库为最终正文**） |
| `tool-call` | `name` | `input`, `runId` | 工具开始；`input` 为已安全化对象 |
| `tool-result` | `name` | `outputPreview`, `runId`, `status` | 工具结束；`outputPreview` 为摘要字符串 |
| `widget` | `widgetId`, `question` | `widgetType`, `choices`, `allowFreeText` | 交互选择框（如 ask_user 工具） |
| `title-updated` | `conversationId`, `title` | — | 会话标题更新（异步生成或兜底） |
| `llm-usage` | `type`, `usage` | `usageEventId`, `providerId`, `chatModel` 等 | Token 用量增量（前端累计展示） |
| `error` | `message` | — | 错误 |

**UI 建议（非强制）**：用 `runId` 配对 `tool-call` 与 `tool-result`（若两者均含且一致）。

**通义千问深度思考**：`llm_provider=qwen` 时，可在后端环境变量设置 `QWEN_ENABLE_THINKING=true`，并将 `QWEN_CHAT_MODEL` 设为支持思考的模型（如 `qwen-flash`）。后端会通过兼容接口的 `extra_body` 传入 `enable_thinking: true`（与 DashScope OpenAI 兼容调用一致）。流式响应里思考内容在 `choices[0].delta.reasoning_content`；标准 `langchain_openai.ChatOpenAI` 不会把该字段写入消息 chunk，本仓库在 `app/llm/providers/qwen.py` 的 `DashScopeChatOpenAI` 与 `app/chat/services/streaming/` 中做了补齐与转发，前端即可收到 `thinking-delta`。不支持该参数的模型请保持 `false`。

### D.4 匿名会话状态机

1. 首次请求：不传 `conversation_id` → 从 `meta` 取 `conversationId`，若存在 `anonSessionSecret` 则客户端持久化。
2. 续聊请求：传 `conversation_id` + `anon_session_secret`（与 meta 一致）。
3. 拉消息：`GET /api/chat/conversations/{conversation_id}/messages`，匿名必须带 `X-Anonymous-Session: <anonSessionSecret>`。

### D.5 知识库工具与匿名

未登录时知识库检索工具行为受后端 `DEFAULT_KNOWLEDGE_BASE_ID` 等配置约束；细节以 OpenAPI + 后端配置为准。

## E. 其他 API 前缀（摘要）

| 前缀 | 需登录 | 备注 |
|------|--------|------|
| `/api/knowledge` | 是 | 多租户：仅当前用户的 `owner_id`；响应含 `owner_id` |
| `/api/agents` | 是 | 可选 API_KEY |
| `/api/mcp` | 是 | 可选 API_KEY |
| `/health` | 否 | `GET /health` |
| `/health/deps` | 否 | postgres/redis/qdrant 状态值为 `ok` \| `fail` \| `error` 字符串 |

具体路径与 body 以 **openapi.json** 为准。

## F. HTTP 状态与错误体

| 状态码 | 典型含义 |
|--------|-----------|
| 401 | 未登录或 Token 无效 |
| 403 | 禁止（如匿名凭证错误） |
| 404 | 资源不存在；**含无权访问的资源可能统一 404**（防枚举） |

业务错误体常见：`{"code": "<STRING>", "message": "<STRING>"}`（以实际响应为准）。

## G. 实现检查清单（给 AI 自测）

- [ ] `POST /api/chat` 使用能读流的 HTTP 客户端（fetch ReadableStream / EventSource 限制注意 POST body）。
- [ ] 解析 SSE 时处理 UTF-8 多字节与分块，不要假设单行即完整 JSON。
- [ ] 匿名用户本地存储 `conversationId` + `anonSessionSecret`（勿提交到公开仓库）。
- [ ] 字段级核对以 **openapi.json** 为准。

## H. 相关文档

- `api-documentation.md`：OpenAPI 与 `doc/` 的分工、如何加载上下文。
- 服务端若扩展 SSE `type`，以 `backend/app/chat/services/streaming/` 为准，并同步更新 **D.3** 表格。
