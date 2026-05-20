"""Chat 路由基线：拆分 router 后 path+method 不得漂移。"""

import json
from pathlib import Path

from app.chat.api.router import router as chat_router

BASELINE = (
    Path(__file__).resolve().parent / "fixtures" / "chat_router_routes_baseline.json"
)


def _collect_chat_routes() -> list[dict[str, str]]:
    prefix = (chat_router.prefix or "").rstrip("/")
    out: list[dict[str, str]] = []
    for r in chat_router.routes:
        methods = getattr(r, "methods", None) or set()
        rel = (getattr(r, "path", None) or "").strip()
        if rel.startswith(prefix):
            full = rel
        elif rel:
            full = f"{prefix}{rel}" if rel.startswith("/") else f"{prefix}/{rel}"
        else:
            full = prefix
        for m in sorted(methods):
            if m in ("HEAD", "OPTIONS"):
                continue
            out.append({"method": m, "path": full})
    out.sort(key=lambda x: (x["path"], x["method"]))
    return out


def test_chat_router_matches_baseline():
    expected = json.loads(BASELINE.read_text(encoding="utf-8"))
    expected.sort(key=lambda x: (x["path"], x["method"]))
    assert _collect_chat_routes() == expected
