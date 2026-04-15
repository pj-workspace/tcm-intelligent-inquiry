"""症状/证型同义词组：扩展用户表述以提高召回（无需改库表）。"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "symptom_synonyms.json"


@lru_cache(maxsize=1)
def _load_groups() -> tuple[tuple[str, ...], ...]:
    if not _DATA.is_file():
        return ()
    try:
        raw = json.loads(_DATA.read_text(encoding="utf-8"))
        groups = raw.get("groups") if isinstance(raw, dict) else None
        if not isinstance(groups, list):
            return ()
        out: list[tuple[str, ...]] = []
        for g in groups:
            if isinstance(g, list):
                terms = tuple(str(x).strip() for x in g if str(x).strip())
                if len(terms) >= 2:
                    out.append(terms)
        return tuple(out)
    except (OSError, json.JSONDecodeError):
        return ()


def expand_clinical_text(clinical_query: str, pattern_hint: str | None) -> str:
    """若用户表述命中某同义词组中的任一词，则把同组其余词拼入扩展串，供子串匹配与 pg_trgm。"""
    q = (clinical_query or "").strip()
    hint = (pattern_hint or "").strip()
    combined = f"{q} {hint}".strip()
    if not combined:
        return q

    extras: list[str] = []
    seen = set(combined)
    for group in _load_groups():
        if any(term in combined for term in group):
            for term in group:
                if term not in seen and term not in combined:
                    extras.append(term)
                    seen.add(term)

    if not extras:
        return f"{q} {hint}".strip()

    return f"{q} {hint} {' '.join(extras)}".strip()
