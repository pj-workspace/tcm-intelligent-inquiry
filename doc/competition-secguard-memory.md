# 比赛项目记忆 — XH-202614 AI+安全大模型平台的智能体研究

> 供新对话窗口快速恢复上下文。最后更新：2026-05-23

---

## 1. 赛题概要

| 项 | 内容 |
|---|---|
| 题目编号 | XH-202614 |
| 名称 | AI+安全大模型平台的智能体研究 |
| 发榜单位 | 深信服、张家口默然教育 |
| 核心理念 | 依托深信服 AI 安全平台，智能融合、化繁为简、实战有效 |
| 报名 | 2026-05-30 ~ 06-30（挑战杯官网） |
| 作品提交 | 2026-09-05 前发邮箱 daitingting@sangfor.com.cn |
| 初审 | 2026-09-30；终审/擂台赛 11 月底前 |

### 评分结构（初审 100 分）

1. **基础任务 70 分**：场景化安全智能体（告警误报剔除、漏洞排查、安全报告生成等）
2. **进阶任务 20 分**：安全垂域知识库 + RAG + 工具扩展
3. **挑战任务 10 分**：SuperAgent — CoT 推理、多源数据、ReAct、跨域协同、防火墙/EDR 处置闭环

### 交付物

- 源代码、设计/开发/测试文档、总结报告
- 宣讲 PPT + 3 分钟演示视频
- 可运行部署

---

## 2. 现有 TCM 项目可复用能力

**仓库**：`/Users/jaypan/MyProjects/tcm-intelligent-inquiry`

**定位**：面向中医的可配置 ReAct 智能体平台（FastAPI + Next.js），本质是 **Agent + RAG + MCP + SSE 流式** 通用底座。

### 可直接复用（不必重写）

| 能力 | 关键路径 |
|------|----------|
| LangGraph ReAct | `backend/app/agent/react_graph.py`, `executor.py` |
| 工具注册表 | `backend/app/agent/tools/registry.py`, `loader.py` |
| SSE 流式 + 思考/工具轨迹 | `backend/app/chat/services/streaming/stream_chat.py` |
| Brainstorm Trace UI | `frontend/components/chat/brainstorm/` |
| RAG（Qdrant + rerank） | `backend/app/knowledge/` |
| MCP 桥接（HTTP/stdio） | `backend/app/mcp/bridge/tool_bridge.py` |
| 人机确认 ask_user | `backend/app/agent/tools/ask_user/` |
| 多模型切换 | `backend/app/llm/`, `backend/app/chat/catalog.py` |
| Agent CRUD + 配置 UI | `backend/app/agent/`, `frontend/components/settings/agents/` |
| MCP/知识库管理 UI | `frontend/components/settings/mcp/`, `knowledge/` |

### 与安全赛题差距（需新增，非架构重写）

- 领域：中医 → 安全运营/SOC
- 安全工具：告警、IOC/CVE、SIEM、防火墙/EDR
- 深信服平台适配层（暂无权限时用 Mock）
- SuperAgent 轻量编排（可选）
- 完整安全化 UI/文档/演示剧本

---

## 3. 已确认的用户决策

| 决策 | 选择 |
|------|------|
| 深信服平台权限 | 暂时没有，后续申请/对接 |
| 目标完成度 | **冲高奖**（基础 + RAG + SuperAgent/闭环） |
| TCM 项目 | **6 月收尾**，与比赛并行但不混改主流程 |
| 发展路线 | **线性发展**：先做安全工具包 → 6 月后复制 TCM → 集成工具做安全项目 |

---

## 4. 推荐作品方向（最优）

**SecGuard Copilot — 基于深信服 AI 安全平台的 SOC 告警研判与自动响应智能体**

### 3 分钟演示链路（固定剧本）

```
告警输入 → 多源取证（资产/IOC/CVE/日志）
→ RAG 查处置 SOP → 判断风险与 ATT&CK 阶段
→ ask_user 人工确认 → 模拟封禁 IP / 隔离主机
→ 生成 incident 报告 → 展开 Brainstorm 展示 ReAct 全链路
```

### 备选名称（未选）

- ThreatMind（偏情报/RAG，闭环弱）
- ComplianceGuard（偏合规文档，运营感弱）

---

## 5. 线性发展路线（当前最优策略）

```
现在 ~ 6 月     TCM 项目收尾 + 独立开发 security-tools 工具包（Mock 数据）
6 月后          git clone/fork TCM → secguard-copilot
7 ~ 8 月        安全化：prompt/UI/知识库/接工具/文档/PPT/视频
9 月            提交比赛
```

**为什么先工具后复制：**

- 比赛拉开差距的是 **工具 + 闭环**，不是聊天壳子
- 壳子、RAG、MCP、SSE 已有，6 月后直接复用
- 不污染 TCM 6 月交付
- 工具可独立测试，也可作为 MCP server 接入

---

## 6. 优先开发的安全工具（Mock 先行）

建议独立仓库或目录：`security-agent-tools/`

| 工具 | 作用 |
|------|------|
| `query_alerts` | 查询/注入演示告警 |
| `asset_lookup` | 资产台账、重要等级、负责人 |
| `ioc_lookup` | IP/域名/Hash 威胁情报 |
| `cve_lookup` | CVE 详情、影响版本、修复建议 |
| `siem_query` | 模拟日志、登录、流量异常 |
| `search_security_kb` | 安全 RAG（SOP/等保/ATT&CK） |
| `firewall_block_ip` | 模拟封禁（dry-run + 审批） |
| `edr_isolate_host` | 模拟隔离主机 |
| `generate_incident_report` | 处置报告 |

### 演示数据（`data/security/`）

- `alerts_demo.json` — 勒索、钓鱼、暴力破解、C2、横移 3~5 条
- `assets_seed.json`, `ioc_seed.json`, `cve_seed.json`
- `siem_logs_demo.json`
- `mock_firewall_responses.json`, `mock_edr_responses.json`
- PDF/DOCX：勒索响应 SOP、钓鱼处置、防火墙封禁规范

### 接入方式

- 优先做成 **MCP server** 或独立 Python 模块
- 复制 TCM 后通过现有 `mcp/bridge/tool_bridge.py` 注册，改动最小

---

## 7. 6 月后安全项目结构（复制后改造）

```
backend/app/
  agent/ chat/ knowledge/ mcp/ llm/     # 保留平台层
  security/                              # 新建安全域
    prompts.py, safety.py, schemas.py
    demo/                                # 演示告警注入 API
  agent/tools/security/                  # 或 MCP 外挂
  integrations/sangfor/                  # 适配层
    client.py, mock/, adapters/{alerts,firewall,edr}.py
  agent/supervisor/                      # 可选 SuperAgent

frontend/
  components/security/                   # 告警卡、审批、演示面板
  lib/security/demoAlerts.ts
```

### 复制命令

```bash
git clone tcm-intelligent-inquiry secguard-copilot
# 或 fork 后 clone
```

### 安全化 checklist

- [ ] 替换 system prompt / 免责声明
- [ ] 隐藏或移除 TCM 专属工具（formula_lookup 等）
- [ ] 注册 security 工具 / MCP
- [ ] 导入安全知识库
- [ ] UI rebranding（零中医元素）
- [ ] README / PPT / 演示视频

---

## 8. 两项目 vs 单项目

| 方案 | 结论 |
|------|------|
| **两仓库 + cherry-pick** | 长期最干净；通用 commit 用 `shared:` 前缀 |
| **单仓库多领域** | 短期可行；需 `domains/tcm` + `domains/security` 严格隔离 |
| **当前选择** | **线性：先工具 → 6 月后复制成第二项目** |

### 若日后双项目同步通用优化

```bash
# 在 A 项目
git commit -m "shared: improve streaming output handling"

# 在 B 项目
git remote add other ../other-project
git fetch other
git cherry-pick <hash>
```

**原则**：共享 commit 不含领域代码；一个 commit 只做一件事。

---

## 9. 里程碑

| 阶段 | 时间 | 交付 | 得分 |
|------|------|------|------|
| M0 工具包 | 现在~6月 | security-tools + mock 数据 + 独立 README | 铺垫 |
| M1 复制+换壳 | 6月后 1 周 | secguard-copilot、安全 prompt、演示入口 | 基础骨架 |
| M2 场景闭环 | +1 周 | 告警研判 + ReAct + Trace 演示 | **基础 70** |
| M3 RAG | +3~5 天 | 安全 KB + search_security_kb + IOC/CVE | **进阶 20** |
| M4 处置闭环 | +1 周 | Mock 封禁/隔离 + ask_user 审批 | **挑战前半** |
| M5 SuperAgent | +1 周 | supervisor：Triage→Intel→Response→Report | **挑战 10** |
| M6 深信服对接 | 并行 | 替换 mock adapter | 加分 |
| M7 交付 | 9月前 | 文档/PPT/视频/部署 | — |

**最小可参赛**：M1 + M2 + M3 + M4（约 2~2.5 周，6 月后开始计）

---

## 10. 难度判断

| 目标 | 难度 | 周期 |
|------|------|------|
| 能参赛 MVP | 中等 | 6 月后 2~3 周 |
| 有竞争力 | 偏难 | 4~6 周 |
| 冲高奖/擂台 | 难 | 需稳定演示 + 平台对接 + 安全专业度 |

**结论**：有 TCM 底座不算从零；难点在 **安全场景包装、工具闭环、演示稳定性**，不是 Agent 架构。

---

## 11. 风险与规避

| 风险 | 规避 |
|------|------|
| 无深信服权限 | `integrations/sangfor/mock` + MCP Mock；答辩强调适配层可替换 |
| 被看成「中医改皮」 | 独立项目 + 完整 rebranding + Demo 零 TCM |
| 真实封禁误操作 | 默认 dry-run；写操作必须 ask_user |
| RAG 像通用 ChatGPT | 强制先检索；SSE 展示引用片段 |
| TCM 与比赛互相污染 | **6 月前只在外部做工具包，不改 TCM 主流程** |
| 时间不够 | 优先 M2~M4；SuperAgent 做轻量 supervisor 即可 |

---

## 12. 赛题联系人（需平台帮助时）

- 顾问：彭老师 13970977157、樊老师 18911589114
- 赛务：代老师 13269852560、潘老师 18611409869、刘老师 13031018866
- 作品邮箱：daitingting@sangfor.com.cn（抄送 47215869@qq.com）

---

## 13. 新对话窗口可直接说

> 我在做挑战杯 XH-202614 安全智能体比赛，已有 TCM ReAct+RAG+MCP 底座。策略是 6 月前独立做 security-tools，6 月后 fork 成 secguard-copilot。可以先读 `doc/competition-secguard-memory.md`

---

## 14. 相关仓库文件速查

```
doc/competition-secguard-memory.md          # 本文件
doc/项目技术方案设计.md                      # 可改写成安全版技术方案
doc/frontend-integration.md                 # SSE 契约
backend/app/agent/prompts.py                # 当前 TCM prompt（安全项目需替换）
backend/app/agent/tools/tcm_search/plugin.py # RAG 工具样板（复制改域）
backend/app/agent/tools/formula/            # 结构化检索样板（→ IOC/CVE）
backend/app/mcp/bridge/tool_bridge.py       # MCP 接入点
frontend/components/chat/brainstorm/        # ReAct 演示 UI
```
