#!/usr/bin/env python3
"""Fix docstrings inserted inside multi-line function signatures."""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def should_include(path: Path) -> bool:
    s = str(path).replace("\\", "/")
    if "__pycache__" in s or "/agent/" in s:
        return False
    rel = path.relative_to(ROOT).as_posix()
    return rel.startswith(("app/", "alembic/versions/", "tests/test_"))


def signature_end_line(lines: list[str], def_lineno: int) -> int:
    """Return 1-based line number of closing ``):`` for a ``def`` starting at ``def_lineno``."""
    for i in range(def_lineno - 1, min(len(lines), def_lineno + 30)):
        if re.search(r"\)\s*(->[^:]+)?:\s*(#.*)?$", lines[i]):
            return i + 1
    return def_lineno


def is_stray_signature_docstring(line: str) -> bool:
    s = line.strip()
    return s.startswith('"""') and s.endswith('"""') and len(s) >= 6


def fix_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines()

    # Remove stray docstrings that sit between def and body (inside signature)
    changed = False
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("def ") or stripped.startswith("async def "):
            def_ln = i + 1
            sig_end = signature_end_line(lines, def_ln)
            j = def_ln
            while j < sig_end and j < len(lines):
                if is_stray_signature_docstring(lines[j]):
                    lines.pop(j)
                    sig_end -= 1
                    changed = True
                    continue
                j += 1
        i += 1

    # Re-parse and insert docstrings at correct positions
    source = "\n".join(lines) + ("\n" if original.endswith("\n") else "")
    try:
        tree = ast.parse(source)
    except SyntaxError:
        print(f"still broken: {path}", file=sys.stderr)
        return False

    inserts: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if ast.get_docstring(node) is not None:
                continue
            end_ln = signature_end_line(lines, node.lineno) if isinstance(
                node, (ast.FunctionDef, ast.AsyncFunctionDef)
            ) else node.lineno
            def_line = lines[end_ln - 1]
            m = re.match(r"^(\s*)", def_line if not isinstance(node, ast.ClassDef) else lines[node.lineno - 1])
            indent = (m.group(1) if m else "") + "    "
            name = node.name
            if isinstance(node, ast.ClassDef):
                doc = f"{name}."
            elif name == "__init__":
                doc = "Initialize instance."
            elif name.startswith("_"):
                doc = f"Internal helper: {name}."
            else:
                doc = f"{name}."
            inserts.append((end_ln, f'{indent}"""{doc}"""'))

    inserts.sort(key=lambda x: x[0], reverse=True)
    for idx, doc_line in inserts:
        lines.insert(idx, doc_line)
        changed = True

    if not changed:
        return False

    new_content = "\n".join(lines)
    if original.endswith("\n"):
        new_content += "\n"
    path.write_text(new_content, encoding="utf-8")
    return True


def main() -> int:
    fixed = 0
    for base in [ROOT / "app", ROOT / "alembic" / "versions", ROOT / "tests"]:
        for p in sorted(base.rglob("*.py")):
            if should_include(p):
                try:
                    ast.parse(p.read_text(encoding="utf-8"))
                except SyntaxError:
                    if fix_file(p):
                        fixed += 1
                        print(f"fixed: {p.relative_to(ROOT)}")
    print(f"Fixed {fixed} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
