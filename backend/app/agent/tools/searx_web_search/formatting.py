"""SearXNG 结果格式化（供检索逻辑与单元测试共用）。"""

from __future__ import annotations

from typing import Any

from app.agent.tools._internal.citations import register_citation_source


def _searx_diagnostics_for_llm(payload: dict[str, Any]) -> str:
    """results 为空时，把 SearXNG 的引擎级错误写进回执，便于排查「联网搜索没结果」。"""
    u = payload.get("unresponsive_engines")
    lines: list[str] = []
    if isinstance(u, list) and u:
        for ent in u[:8]:
            if (
                isinstance(ent, (list, tuple))
                and len(ent) >= 2
                and isinstance(ent[0], str)
            ):
                lines.append(f"  - {ent[0]}: {ent[1]}")
            elif isinstance(ent, str):
                lines.append(f"  - {ent}")
        if lines:
            return (
                "当前各搜索引擎未返回有效结果，引擎状态：\n"
                + "\n".join(lines)
                + "\n\n常见原因：出网被拦、DNS/代理、或目标站点限流/超时。可调大 "
                "SearXNG 的 `outgoing.request_timeout`、检查 Docker 出网、换网络后重试。"
            )

    n = payload.get("number_of_results")
    if (
        isinstance(n, (int, float))
        and n == 0
        and not (isinstance(u, list) and u)
    ):
        return (
            "SearXNG 报告 0 条命中。请确认 `SEARXNG_URL` 指向可用实例、"
            "SearXNG 容器到公网是否畅通，以及 `search.formats` 含 `json`。"
        )
    return (
        "常见原因：本机/ Docker 到公网出站受限、目标站点限流/超时。"
        "可尝试调大 `docker/searxng/settings.yml` 的 `outgoing.request_timeout` 后执行 "
        "`docker compose restart searxng`，或检查代理/换网络环境。"
    )


def format_searx_results_for_llm(payload: dict[str, Any], max_results: int) -> str:
    """将 SearXNG JSON 中的 results 转为模型可读文本。

    Args:
        payload: SearXNG ``/search?format=json`` 响应体。
        max_results: 最多格式化的结果条数。

    Returns:
        带来源 id 标记的纯文本；无结果时附带诊断说明。
    """
    rows = payload.get("results")
    if not isinstance(rows, list) or not rows:
        return (
            "SearXNG 未返回任何结果条目（results 为空）。\n"
            + _searx_diagnostics_for_llm(payload)
        )

    lines: list[str] = []
    n_shown = 0
    for item in rows[:max_results]:
        if not isinstance(item, dict):
            continue
        n_shown += 1
        title = str(item.get("title", "")).strip() or "(无标题)"
        url = str(item.get("url", "")).strip()
        content = str(item.get("content", "")).strip()
        eng = str(item.get("engine", "")).strip()
        meta = f" [{eng}]" if eng else ""
        citation = register_citation_source(
            kind="web",
            title=title,
            source=eng or "SearXNG",
            url=url,
            snippet=content,
            metadata={"engine": eng} if eng else None,
        )
        chunk = f"[{citation['id']}]{meta} {title}\n{url}\n{content}"
        lines.append(chunk.strip())
    if not lines:
        return "SearXNG 返回的结果格式异常，无法解析。"
    return "\n\n".join(lines)
