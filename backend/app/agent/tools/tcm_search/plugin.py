"""中医知识检索工具：调用 Qdrant 向量库做语义检索。"""

from langchain_core.tools import tool

from app.agent.tools._internal.citations import register_citation_source
from app.agent.tools.registry import tool_registry
from app.core.chat_context import chat_agent_kb_id, chat_user_id
from app.core.config import get_settings
from app.core.database import async_session_factory
from app.core.exceptions import ValidationError
from app.knowledge.models import KnowledgeBaseRecord
from app.knowledge.search import VectorStoreUnavailable, retrieve_kb_chunks
from sqlalchemy import select


async def _kb_visible_to_user(kb_id: str, user_id: str | None) -> bool:
    """知识库存在且 owner_id 与 user_id 一致时返回 True。"""
    async with async_session_factory() as session:
        row = await session.get(KnowledgeBaseRecord, kb_id)
        if row is None:
            return False
        if user_id is None:
            return False
        return row.owner_id == user_id


async def _resolve_kb_id(explicit_kb_id: str | None) -> str | None:
    """解析本次检索应使用的知识库 ID（Agent 默认库 / 环境变量 / 用户首个自有库）。"""
    uid = chat_user_id.get()
    s = get_settings()
    default_kid = s.default_knowledge_base_id.strip()

    agent_kb = chat_agent_kb_id.get()
    if agent_kb and agent_kb.strip() and not (explicit_kb_id and explicit_kb_id.strip()):
        explicit_kb_id = agent_kb.strip()

    if explicit_kb_id and explicit_kb_id.strip():
        kid = explicit_kb_id.strip()
        if uid is None:
            # 未登录仅允许显式指定与环境变量一致的共享库 ID
            if default_kid and kid == default_kid:
                async with async_session_factory() as session:
                    row = await session.get(KnowledgeBaseRecord, kid)
                return kid if row is not None else None
            return None
        if not await _kb_visible_to_user(kid, uid):
            return None
        return kid

    if uid is None:
        # 未登录：仅允许环境变量中的全局默认库（只读共享）
        if default_kid:
            async with async_session_factory() as session:
                row = await session.get(KnowledgeBaseRecord, default_kid)
            return default_kid if row is not None else None
        return None

    if default_kid:
        if await _kb_visible_to_user(default_kid, uid):
            return default_kid

    async with async_session_factory() as session:
        r = await session.execute(
            select(KnowledgeBaseRecord.id)
            .where(KnowledgeBaseRecord.owner_id == uid)
            .order_by(KnowledgeBaseRecord.name)
            .limit(1)
        )
        return r.scalar_one_or_none()


@tool_registry.register
@tool
async def search_tcm_knowledge(
    query: str,
    kb_id: str | None = None,
    top_k: int = 5,
) -> str:
    """检索已入库的中医知识库文档片段（Qdrant 向量检索），用于需要依据的回答。

    使用时机：
    - 用户要求经典依据、文献支撑、知识库资料、出处或原文。
    - 问题涉及中医理论、证型、病位、方义等，且需要基于已上传资料核实。
    - 你准备引用知识库内容或需要先查资料再综合回答。

    不要使用时机：
    - 用户只是闲聊、简单定义、或明确不要检索。
    - 用户明确给出方剂名并询问组成/功效/主治时，应优先 formula_lookup。

    返回内容是若干相关片段及来源；请基于片段归纳，不要捏造未返回的出处。

    参数：
    - query: 检索问题或关键词。
    - kb_id: 可选，指定知识库 ID；不传则优先使用当前 Agent 绑定的默认知识库，否则按环境变量/用户名下第一个自有库解析。
    - top_k: 返回片段条数，默认 5。
    """
    q = (query or "").strip()
    if not q:
        return "请提供有效的检索内容。"

    uid = chat_user_id.get()
    s = get_settings()
    if uid is None and not s.default_knowledge_base_id.strip():
        return "知识库检索需要登录后使用；或请配置 DEFAULT_KNOWLEDGE_BASE_ID 作为匿名可读共享库。"

    resolved = await _resolve_kb_id(kb_id)
    if not resolved:
        return (
            "当前没有可用的知识库：请先登录后在「知识库管理」中创建并导入文档，"
            "或联系管理员配置 DEFAULT_KNOWLEDGE_BASE_ID；"
            "若已指定 kb_id，请确认该库归您所有。"
        )

    try:
        k = max(1, min(int(top_k), 20))
    except (TypeError, ValueError):
        k = 5
    try:
        pairs = await retrieve_kb_chunks(resolved, q, k)
    except (VectorStoreUnavailable, ValidationError) as exc:
        # 工具层不应让 Agent 崩溃；返回提示文本，由模型决定是否换用其他工具
        return (
            f"知识库 `{resolved}` 当前不可用（{exc}），"
            "请稍后重试，或联系管理员检查 Qdrant / 嵌入模型配置。"
        )
    if not pairs:
        return (
            f"在知识库 `{resolved}` 中未检索到与「{q}」相关的片段；"
            "请确认已上传文档或尝试换用其他关键词。"
        )

    lines: list[str] = []
    for i, (doc, score) in enumerate(pairs, start=1):
        src = doc.metadata.get("source", "")
        snippet = doc.page_content.strip()
        citation = register_citation_source(
            kind="knowledge",
            title=str(src or f"知识库片段 {i}"),
            source=str(src or ""),
            snippet=snippet,
            score=float(score),
            metadata={
                "kb_id": resolved,
                "kb_doc_id": doc.metadata.get("kb_doc_id"),
            },
        )
        lines.append(
            f"[{citation['id']}]（相关分数 {score:.4f}，来源: {src}）\n{snippet}"
        )
    return "\n\n".join(lines)
