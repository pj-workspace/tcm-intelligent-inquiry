#!/usr/bin/env python3
"""Replace bare name-only docstrings with readable one-liners."""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BARE = re.compile(r'^(\s*)"""([a-z][a-z0-9_]*)\."""$')


def humanize(name: str) -> str:
    s = name.removeprefix("test_")
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
    return s.replace("_", " ").strip()


def should_include(path: Path) -> bool:
    s = str(path).replace("\\", "/")
    if "__pycache__" in s or "/agent/" in s:
        return False
    rel = path.relative_to(ROOT).as_posix()
    return rel.startswith(("app/", "alembic/versions/", "tests/test_"))


def route_summary(lines: list[str], func_lineno: int) -> str | None:
    """Extract FastAPI ``summary=`` from decorators above ``func_lineno``."""
    for i in range(func_lineno - 2, max(func_lineno - 12, -1), -1):
        line = lines[i]
        m = re.search(r'summary\s*=\s*"([^"]+)"', line)
        if m:
            return m.group(1)
        if line.strip().startswith("async def ") or line.strip().startswith("def "):
            break
    return None


def better_doc(name: str, summary: str | None, is_test: bool) -> str:
    if summary:
        return summary
    if is_test:
        return f"验证 {humanize(name)}。"
    if name.endswith("_route"):
        name = name[: -len("_route")]
    return f"{humanize(name).capitalize()}。"


def process_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    tree = ast.parse(text)
    # Map docstring line -> function name (first stmt in body)
    doc_line_to_func: dict[int, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.body and isinstance(node.body[0], ast.Expr):
                doc_line_to_func[node.body[0].lineno] = node.name

    changed = False
    is_test = path.name.startswith("test_")
    for i, line in enumerate(lines):
        m = BARE.match(line)
        if not m:
            continue
        lineno = i + 1
        name = doc_line_to_func.get(lineno)
        if not name:
            continue
        indent, _ = m.group(1), m.group(2)
        summary = route_summary(lines, lineno)
        doc = better_doc(name, summary, is_test)
        lines[i] = f'{indent}"""{doc}"""'
        changed = True

    if not changed:
        return False
    out = "\n".join(lines)
    if text.endswith("\n"):
        out += "\n"
    path.write_text(out, encoding="utf-8")
    return True


def main() -> int:
    n = 0
    for base in [ROOT / "app", ROOT / "alembic" / "versions", ROOT / "tests"]:
        for p in sorted(base.rglob("*.py")):
            if should_include(p) and process_file(p):
                n += 1
                print(f"enhanced: {p.relative_to(ROOT)}")
    print(f"Enhanced {n} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
