"""方剂查询与症状/证型推荐逻辑。

推荐打分 = 关键词/证型子串分 + pg_trgm 相似度 +（可选）全文 ts_rank。
同义词扩展见 `symptom_synonyms.json`，不改表结构。
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.tools.formula.models import FormulaRecord
from app.agent.tools.formula.synonyms import expand_clinical_text
from app.core.logging import get_logger

logger = get_logger(__name__)

_NS = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")

# 与数据库侧 trigram / ts_rank 量纲对齐的经验权重
_W_TRGM = 14.0
_W_FTS = 5.0


def _stable_id(name: str) -> str:
    return str(uuid.uuid5(_NS, name.strip()))


def _as_str_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [str(x).strip() for x in raw if str(x).strip()]


def _format_formula_block(row: FormulaRecord, rank: int | None = None) -> str:
    head = f"【{row.name}】"
    if rank is not None:
        head = f"[{rank}] {head}"
    aliases = _as_str_list(row.aliases)
    alias_line = f"别名：{'、'.join(aliases)}" if aliases else ""
    patterns = _as_str_list(row.pattern_tags)
    pat_line = f"常见证型/病机标签：{'、'.join(patterns)}" if patterns else ""
    src = (row.source_ref or "").strip()
    src_line = f"文献出处：{src}" if src else ""
    parts = [
        head,
        f"组成：{row.composition.strip()}",
        f"功效：{row.efficacy.strip()}",
        f"主治：{row.indications.strip()}",
    ]
    if alias_line:
        parts.append(alias_line)
    if pat_line:
        parts.append(pat_line)
    if src_line:
        parts.append(src_line)
    parts.append(
        "（以上内容仅供中医药文化与知识学习参考，不构成诊疗方案，不适请就医。）"
    )
    return "\n".join(parts)


async def lookup_formula_by_name(session: AsyncSession, formula_name: str) -> str:
    q = (formula_name or "").strip()
    if not q:
        return "请提供方剂名称。"

    r = await session.execute(
        select(FormulaRecord).where(FormulaRecord.name.ilike(f"%{q}%"))
    )
    by_id: dict[str, FormulaRecord] = {row.id: row for row in r.scalars().all()}
    if not by_id:
        r2 = await session.execute(select(FormulaRecord))
        for row in r2.scalars().all():
            for al in _as_str_list(row.aliases):
                if q in al or al in q:
                    by_id[row.id] = row
                    break
    rows = list(by_id.values())
    if not rows:
        return (
            f"未在本地方剂库中找到与「{q}」匹配的条目。"
            "可尝试更常用的方名，或使用 recommend_formulas 按症状/证型检索。"
        )

    if len(rows) > 1:
        lines = [f"找到 {len(rows)} 条相关方剂，请择一参考或缩小方名："]
        for i, row in enumerate(rows[:8], start=1):
            lines.append(_format_formula_block(row, rank=i))
        if len(rows) > 8:
            lines.append(f"... 另有 {len(rows) - 8} 条未列出。")
        return "\n\n".join(lines)

    return _format_formula_block(rows[0])


def _score_row(row: FormulaRecord, mega_query: str, pattern_hint: str | None) -> float:
    """基于症状词表、证型标签与主治子串的启发式分；mega_query 已含同义词扩展。"""
    q = (mega_query or "").strip()
    hint = (pattern_hint or "").strip()
    score = 0.0
    for kw in _as_str_list(row.symptom_keywords):
        if kw and kw in q:
            score += 2.0
    for kw in _as_str_list(row.pattern_tags):
        if kw and (kw in q or (hint and (kw in hint or hint in kw))):
            score += 2.5
    if hint:
        for kw in _as_str_list(row.pattern_tags):
            if kw and kw in hint:
                score += 3.0
    blob = f"{row.indications}{row.efficacy}"
    if hint and hint in blob:
        score += 1.0
    for seg in (row.indications, row.efficacy):
        for i in range(0, len(q) - 1, 2):
            chunk = q[i : i + 4]
            if len(chunk) >= 2 and chunk in seg:
                score += 0.3
    return score


def _build_tsquery_str(expanded: str) -> str | None:
    """构造 simple 配置下 OR 检索串；过滤易破坏 to_tsquery 的字符。"""
    tokens: list[str] = []
    seen: set[str] = set()
    bad = frozenset("&|:*!()\\")
    for t in expanded.split():
        t = t.strip()
        if len(t) < 2 or any(c in t for c in bad):
            continue
        if t not in seen:
            seen.add(t)
            tokens.append(t)
        if len(tokens) >= 12:
            break
    if not tokens:
        return None
    return " | ".join(tokens)


async def _fetch_trgm_scores(session: AsyncSession, needle: str) -> dict[str, float]:
    """pg_trgm similarity：用户扩展句与方剂拼接文本的整体相似度（适合中文连续串）。"""
    if len(needle) < 2:
        return {}
    sql = text(
        """
        SELECT id,
          similarity(
            COALESCE(indications, '') || ' ' || COALESCE(efficacy, '') || ' ' || COALESCE(composition, '')
              || ' ' || COALESCE(name, '') || ' ' || COALESCE(pattern_tags::text, '') || ' '
              || COALESCE(symptom_keywords::text, ''),
            :needle
          )::double precision AS trgm
        FROM formulas
        """
    )
    try:
        r = await session.execute(sql, {"needle": needle[:4000]})
        return {str(row[0]): float(row[1] or 0.0) for row in r.all()}
    except Exception as exc:
        logger.warning("pg_trgm 相似度查询失败，将仅用关键词分与全文分: %s", exc)
        return {}


async def _fetch_fts_scores(session: AsyncSession, tsq: str) -> dict[str, float]:
    """simple 全文配置：主治/功效/方名合并向量，OR 匹配。"""
    sql = text(
        """
        SELECT id,
          ts_rank_cd(
            setweight(to_tsvector('simple', COALESCE(indications, '')), 'A')
            || setweight(to_tsvector('simple', COALESCE(efficacy, '')), 'B')
            || setweight(to_tsvector('simple', COALESCE(composition, '')), 'B')
            || setweight(to_tsvector('simple', COALESCE(name, '')), 'C'),
            to_tsquery('simple', :tsq)
          )::double precision AS fts
        FROM formulas
        WHERE (
          setweight(to_tsvector('simple', COALESCE(indications, '')), 'A')
          || setweight(to_tsvector('simple', COALESCE(efficacy, '')), 'B')
          || setweight(to_tsvector('simple', COALESCE(composition, '')), 'B')
          || setweight(to_tsvector('simple', COALESCE(name, '')), 'C')
        ) @@ to_tsquery('simple', :tsq)
        """
    )
    try:
        r = await session.execute(sql, {"tsq": tsq})
        return {str(row[0]): float(row[1] or 0.0) for row in r.all()}
    except Exception as exc:
        logger.warning("全文检索打分失败，已忽略: %s", exc)
        return {}


def _normalize_fts(x: float) -> float:
    """压缩长尾，避免 ts_rank 过大主导排序。"""
    return min(1.0, float(x) / (float(x) + 1.0)) if x > 0 else 0.0


async def recommend_formulas_for_clinical(
    session: AsyncSession,
    clinical_query: str,
    pattern_type: str | None,
    top_k: int,
) -> str:
    q0 = (clinical_query or "").strip()
    if len(q0) < 2:
        return "请用一两句话描述症状、体征或就诊诉求，便于检索相关方剂（仅供学习参考）。"

    expanded = expand_clinical_text(q0, pattern_type)
    mega_q = expanded if expanded else q0

    r = await session.execute(select(FormulaRecord))
    rows = list(r.scalars().all())
    if not rows:
        return (
            "本地方剂库暂无数据。请由运维执行种子导入或检查数据库迁移。"
        )

    k = max(1, min(int(top_k), 15))

    trgm_map = await _fetch_trgm_scores(session, mega_q)
    tsq = _build_tsquery_str(mega_q)
    fts_map: dict[str, float] = {}
    if tsq:
        raw_fts = await _fetch_fts_scores(session, tsq)
        fts_map = {fid: _normalize_fts(v) for fid, v in raw_fts.items()}

    scored: list[tuple[float, FormulaRecord]] = []
    for row in rows:
        base = _score_row(row, mega_q, pattern_type)
        tid = row.id
        tr = trgm_map.get(tid, 0.0)
        ft = fts_map.get(tid, 0.0)
        total = base + _W_TRGM * tr + _W_FTS * ft
        if total > 0:
            scored.append((total, row))

    scored.sort(key=lambda x: (-x[0], x[1].name))

    if not scored:
        # 兜底：连续二字在主治中出现（沿用原逻辑，用扩展串）
        fallback: list[tuple[float, FormulaRecord]] = []
        plain = re.sub(r"\s+", "", mega_q)
        for row in rows:
            hit = 0.0
            ind = row.indications or ""
            for i in range(len(plain) - 1):
                bi = plain[i : i + 2]
                if bi and bi in ind:
                    hit += 0.5
            if hit > 0:
                tr_b = trgm_map.get(row.id, 0.0)
                fallback.append((hit + _W_TRGM * tr_b * 0.5, row))
        fallback.sort(key=lambda x: -x[0])
        scored = fallback[:k]

    if not scored:
        return (
            f"根据描述「{q0[:80]}」未匹配到高相关方剂条目。"
            "可补充证型、舌苔脉象或改用更典型症状关键词后再试。"
        )

    lines = [
        "按症状/证型线索从本地方剂库推荐以下条目（相关性仅供参考，不可替代医师辨证）：",
        "",
    ]
    for i, (sc, row) in enumerate(scored[:k], start=1):
        lines.append(_format_formula_block(row, rank=i))
        lines.append("")
    return "\n".join(lines).strip()
