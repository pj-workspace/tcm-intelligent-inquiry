"""加载所有工具模块，触发 @tool_registry.register 注册。

必须在读取 tool_registry.names() / all() 或构建 Agent 之前调用一次。
"""

from __future__ import annotations

import importlib
from typing import Final

# 新增工具时：在此追加模块路径即可
_TOOL_MODULES: Final[tuple[str, ...]] = (
    "app.agent.tools.tcm_search",
    "app.agent.tools.formula_lookup",
)

_loaded: bool = False


def ensure_tools_loaded() -> None:
    """幂等：首次调用时 import 各工具模块，完成注册。"""
    global _loaded
    if _loaded:
        return
    for mod in _TOOL_MODULES:
        importlib.import_module(mod)
    _loaded = True


def reload_tools_for_tests() -> None:
    """仅测试用：重置标志后重新加载（一般业务勿用）。"""
    global _loaded
    _loaded = False
    ensure_tools_loaded()
