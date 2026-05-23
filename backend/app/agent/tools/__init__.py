"""Agent 可调工具集。

约定：
  - 每个业务能力一个顶层子包（如 tcm_search、searx_web_search），内放 plugin.py 做 @tool + registry 注册。
  - 可横向再加模块（run.py、formatting.py 等）以保持 plugin 单薄。
  - ``formula/`` 为方剂结构化数据与服务（ORM / 检索），独立存在；formula_lookup 子包挂载面向 Agent 的工具。
"""
