"""中医文档智能分块策略。

默认先按 Markdown `##` 粗分章节，再对每段做递归字符分块（中医常用分隔符优先）。
"""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import get_settings

# 中医文献常见分隔符优先级（从粗到细）
_TCM_SEPARATORS = [
    "\n## ",
    "\n# ",
    "\n【",
    "\n第",
    "。\n",
    "。",
    "\n",
    " ",
    "",
]


def _expand_documents_for_presplit(docs: list[Document]) -> list[Document]:
    """长文先按 \\n## 切成多段，减少单向量跨章节。"""
    expanded: list[Document] = []
    for doc in docs:
        text = doc.page_content
        if "\n## " not in text:
            expanded.append(doc)
            continue
        parts = text.split("\n## ")
        if parts[0].strip():
            expanded.append(
                Document(
                    page_content=parts[0].strip(),
                    metadata=dict(doc.metadata),
                )
            )
        for p in parts[1:]:
            block = ("## " + p).strip()
            if block:
                expanded.append(Document(page_content=block, metadata=dict(doc.metadata)))
    return expanded


def chunk_documents(
    docs: list[Document],
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[Document]:
    """将文档列表切分为适合向量索引的小块。"""
    s = get_settings()
    cs = chunk_size if chunk_size is not None else s.knowledge_chunk_size
    co = chunk_overlap if chunk_overlap is not None else s.knowledge_chunk_overlap
    work = docs
    if s.knowledge_chunk_presplit_sections:
        work = _expand_documents_for_presplit(docs)
    if not work:
        work = docs

    splitter = RecursiveCharacterTextSplitter(
        separators=_TCM_SEPARATORS,
        chunk_size=cs,
        chunk_overlap=co,
        length_function=len,
    )
    return splitter.split_documents(work)
