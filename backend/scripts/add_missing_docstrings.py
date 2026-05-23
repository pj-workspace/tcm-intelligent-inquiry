#!/usr/bin/env python3
"""Codemod: insert missing module/class/function docstrings (Google-style one-liners).

Only adds docstrings where absent; does not modify existing ones or behavior.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def should_include(path: Path) -> bool:
    s = str(path).replace("\\", "/")
    if "__pycache__" in s:
        return False
    if "/agent/" in s:
        return False
    if s.endswith("/tests/conftest.py"):
        return False
    rel = path.relative_to(ROOT).as_posix()
    if rel.startswith("app/"):
        return True
    if rel.startswith("alembic/versions/"):
        return True
    if rel.startswith("tests/test_"):
        return True
    return False


def module_docstring_for(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    name = path.stem
    if rel.endswith("__init__.py"):
        pkg = path.parent.relative_to(ROOT / "app").as_posix().replace("/", ".")
        if pkg == ".":
            return "TCM 智能问诊后端应用包。"
        return f"`{pkg}` 子包导出与命名空间。"
    if rel.startswith("alembic/versions/"):
        return f"Alembic 迁移：{name}。"
    if rel.startswith("tests/test_"):
        topic = name.removeprefix("test_").replace("_", " ")
        return f"单元/集成测试：{topic}。"
    return f"{rel} 模块。"


def humanize(name: str) -> str:
    s = name.lstrip("_")
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", s)
    return s.replace("_", " ").strip()


def is_test_file(path: Path) -> bool:
    return path.name.startswith("test_")


def is_alembic(path: Path) -> bool:
    return "alembic/versions" in str(path).replace("\\", "/")


def func_docstring(node: ast.FunctionDef | ast.AsyncFunctionDef, path: Path) -> str:
    name = node.name
    if is_alembic(path):
        if name == "upgrade":
            return "Apply schema changes."
        if name == "downgrade":
            return "Revert schema changes."
    if is_test_file(path):
        return f"Test {humanize(name.removeprefix('test_'))}."
    if name == "__init__":
        return "Initialize instance."
    if name.startswith("_") and not name.startswith("__"):
        return f"Internal helper: {humanize(name)}."
    args = [a.arg for a in node.args.args if a.arg not in ("self", "cls")]
    base = humanize(name)
    if args:
        arg_list = ", ".join(f"``{a}``" for a in args[:6])
        if len(args) > 6:
            arg_list += ", ..."
        return f"{base.capitalize()} ({arg_list})."
    return f"{base.capitalize()}."


def class_docstring(node: ast.ClassDef, path: Path) -> str:
    name = node.name
    if name.endswith("Error"):
        return f"{humanize(name)} business exception."
    if name.endswith("Model") or name.endswith("Schema") or name.endswith("Response"):
        return f"{humanize(name)} data model."
    if name == "Settings":
        return "Application settings loaded from environment variables."
    if name == "Base":
        return "SQLAlchemy declarative base for ORM models."
    return f"{humanize(name)}."


def module_insert_line(lines: list[str]) -> int:
    """Return 0-based index where module docstring should be inserted."""
    insert_at = 0
    for i, line in enumerate(lines[:12]):
        stripped = line.strip()
        if stripped.startswith("#!") or stripped.startswith("# -*-") or stripped.startswith("# coding"):
            insert_at = i + 1
        elif stripped.startswith("from __future__"):
            insert_at = i + 1
        elif stripped and not stripped.startswith("#") and insert_at == 0:
            break
    return insert_at


def signature_end_line(lines: list[str], def_lineno: int) -> int:
    """Return 1-based line number of closing ``):`` for a ``def`` starting at ``def_lineno``."""
    for i in range(def_lineno - 1, min(len(lines), def_lineno + 30)):
        if re.search(r"\)\s*(->[^:]+)?:\s*(#.*)?$", lines[i]):
            return i + 1
    return def_lineno


def get_indent(line: str) -> str:
    m = re.match(r"^(\s*)", line)
    return (m.group(1) if m else "") + "    "


def process_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    try:
        tree = ast.parse(original)
    except SyntaxError:
        print(f"SKIP syntax error: {path}", file=sys.stderr)
        return False

    lines = original.splitlines()
    inserts: list[tuple[int, str]] = []  # 0-based line index after which to insert

    if ast.get_docstring(tree) is None:
        doc = module_docstring_for(path)
        idx = module_insert_line(lines)
        inserts.append((idx, f'"""{doc}"""'))

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if ast.get_docstring(node) is not None:
                continue
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                end_ln = signature_end_line(lines, node.lineno)
                header_line = lines[end_ln - 1]
            else:
                end_ln = node.lineno
                header_line = lines[node.lineno - 1]
            indent = get_indent(header_line)
            if isinstance(node, ast.ClassDef):
                doc = class_docstring(node, path)
            else:
                doc = func_docstring(node, path)
            inserts.append((end_ln, f'{indent}"""{doc}"""'))

    if not inserts:
        return False

    # Insert bottom-up (higher line numbers first)
    inserts.sort(key=lambda x: x[0], reverse=True)
    for idx, doc_line in inserts:
        lines.insert(idx, doc_line)

    new_content = "\n".join(lines)
    if original.endswith("\n"):
        new_content += "\n"
    if new_content != original:
        path.write_text(new_content, encoding="utf-8")
        return True
    return False


def main() -> int:
    changed = 0
    targets: list[Path] = []
    for base in [ROOT / "app", ROOT / "alembic" / "versions", ROOT / "tests"]:
        if not base.exists():
            continue
        for p in sorted(base.rglob("*.py")):
            if should_include(p):
                targets.append(p)

    for p in targets:
        if process_file(p):
            changed += 1
            print(f"updated: {p.relative_to(ROOT)}")

    print(f"\nDone. Modified {changed}/{len(targets)} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
