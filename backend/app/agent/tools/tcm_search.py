"""中医知识检索工具：调用 Qdrant 向量库做语义检索。"""

from langchain_core.tools import tool

from app.agent.tools.registry import tool_registry
from app.core.config import get_settings
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.knowledge.models import KnowledgeBaseRecord
from app.knowledge.vectorstore import similarity_search
from sqlalchemy import select

logger = get_logger(__name__)


async def _resolve_kb_id(explicit_kb_id: str | None) -> str | None:
    if explicit_kb_id and explicit_kb_id.strip():
        return explicit_kb_id.strip()
    s = get_settings()
    if s.default_knowledge_base_id.strip():
        return s.default_knowledge_base_id.strip()
    async with async_session_factory() as session:
        r = await session.execute(
            select(KnowledgeBaseRecord.id).order_by(KnowledgeBaseRecord.name).limit(1)
        )
        return r.scalar_one_or_none()


@tool_registry.register
@tool
async def search_tcm_knowledge(
    query: str,
    kb_id: str | None = None,
    top_k: int = 5,
) -> str:
    """检索已入库的中医知识库文档片段（Qdrant 向量检索）。

    参数：
    - query: 检索问题或关键词。
    - kb_id: 可选，指定知识库 ID；不传则使用系统默认或第一个已创建知识库。
    - top_k: 返回片段条数，默认 5。
    """
    q = (query or "").strip()
    if not q:
        return "请提供有效的检索内容。"

    resolved = await _resolve_kb_id(kb_id)
    if not resolved:
        return (
            "当前没有可用的知识库：请先在「知识库管理」中创建并导入文档，"
            "或在环境变量 DEFAULT_KNOWLEDGE_BASE_ID 中指定默认知识库 ID。"
        )

    try:
        k = max(1, min(int(top_k), 20))
    except (TypeError, ValueError):
        k = 5
    pairs = await similarity_search(resolved, q, k)
    if not pairs:
        return (
            f"在知识库 `{resolved}` 中未检索到与「{q}」相关的片段；"
            "请确认已上传文档或尝试换用其他关键词。"
        )

    lines: list[str] = []
    for i, (doc, score) in enumerate(pairs, start=1):
        src = doc.metadata.get("source", "")
        lines.append(f"[{i}]（相似度分数 {score:.4f}，来源: {src}）\n{doc.page_content.strip()}")
    return "\n\n".join(lines)
