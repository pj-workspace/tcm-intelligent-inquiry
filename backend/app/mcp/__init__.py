"""`mcp` 子包导出与命名空间。"""
# mcp: Model Context Protocol 集成域
#
# 子包职责：
#   api/           REST 路由
#   services/      McpService、启动恢复与周期探测逻辑
#   client/        Streamable HTTP / SSE 会话与 discover / call_tool
#   bridge/        挂接到 LangChain tool_registry 的代理工具
#   policy/        MCP URL SSRF 策略
#   health/        进程内周期性 probe 循环
#   models.py      ORM
#   schemas.py     API 契约
