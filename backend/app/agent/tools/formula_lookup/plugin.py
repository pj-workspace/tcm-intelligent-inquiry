"""方剂查询工具：PostgreSQL 结构化库，支持方名检索与症状/证型推荐。"""

from langchain_core.tools import tool

from app.agent.tools.formula.service import (
    lookup_formula_by_name,
    recommend_formulas_for_clinical,
)
from app.agent.tools.registry import tool_registry
from app.core.database import async_session_factory


@tool_registry.register
@tool
async def formula_lookup(formula_name: str) -> str:
    """根据明确方剂名称查询组成、功效、主治与常见证型标签。

    使用时机：
    - 用户给出方剂名，询问组成、功效、主治、适应证、证型标签、方义或煎服相关资料。
    - 用户的问题核心是"这个方是什么/怎么用/治什么"。

    不要使用时机：
    - 用户只描述症状或证型但没有明确方名；此时应考虑 recommend_formulas，必要时先 ask_user。

    支持标准名或常见别名中的模糊匹配；若多条命中会列出若干条供核对。回答时请基于工具结果，不要补造库中没有的组成或主治。
    """
    q = (formula_name or "").strip()
    if not q:
        return "请提供方剂名称。"

    async with async_session_factory() as session:
        out = await lookup_formula_by_name(session, q)
    return out


@tool_registry.register
@tool
async def recommend_formulas(
    clinical_query: str,
    pattern_type: str | None = None,
    top_k: int = 5,
) -> str:
    """依据症状、体征、证型或患者主诉，从本地方剂库推荐可能相关的经典方剂（学习参考）。

    使用时机：
    - 用户描述症状、体征、舌脉、证型或中医病机，希望获得辨证选方思路或相关经典方参考。
    - 用户没有给出明确方名，但希望"可能用什么方/有哪些方可参考"。

    不要使用时机：
    - 用户已经明确给出方剂名并询问该方资料；此时应使用 formula_lookup。
    - 缺少会显著改变辨证方向的关键信息；此时应先 ask_user。

    参数：
    - clinical_query: 症状与体征描述（可含起病、寒热、饮食、二便、疼痛部位等）。
    - pattern_type: 可选，辨证线索或证型提示，如「肝郁脾虚」「少阳证」「脾胃虚寒」等。
    - top_k: 返回条数，默认 5，最大约 15。

    注意：结果为文献与教材常见方的检索式推荐，不能替代执业医师面诊处方。
    """
    try:
        k = int(top_k)
    except (TypeError, ValueError):
        k = 5

    async with async_session_factory() as session:
        out = await recommend_formulas_for_clinical(session, clinical_query, pattern_type, k)
    return out
