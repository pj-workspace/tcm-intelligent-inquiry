"""工具注册表：统一管理所有 Agent 可用工具。

使用方式：
  from app.agent.tools.registry import tool_registry
  tool_registry.register(my_tool)
  tools = tool_registry.get(["search_tcm_knowledge", "formula_lookup"])
"""

from langchain_core.tools import BaseTool


class ToolRegistry:
    """LangChain 工具名到实例的内存注册表。"""

    def __init__(self) -> None:
        """初始化空工具字典。"""
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> BaseTool:
        """注册工具；同名覆盖并返回原 tool 实例（便于装饰器链）。"""
        self._tools[tool.name] = tool
        return tool

    def unregister(self, name: str) -> None:
        """按名称移除工具（不存在时静默）。"""
        self._tools.pop(name, None)

    def get(self, names: list[str]) -> list[BaseTool]:
        """按名称列表返回已注册工具，跳过未知名。"""
        return [self._tools[n] for n in names if n in self._tools]

    def all(self) -> list[BaseTool]:
        """返回全部已注册工具实例。"""
        return list(self._tools.values())

    def names(self) -> list[str]:
        """返回全部已注册工具名。"""
        return list(self._tools.keys())


tool_registry = ToolRegistry()
