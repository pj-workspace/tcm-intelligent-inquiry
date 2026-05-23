"""SearXNG HTTP 调用。"""

from __future__ import annotations

import json

import httpx

from app.agent.tools.searx_web_search.formatting import format_searx_results_for_llm
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


async def run_searx_web_search(
    query: str,
    *,
    max_results: int = 5,
    language: str = "zh",
) -> str:
    """执行 SearXNG 检索并返回可给模型阅读的纯文本。

    Args:
        query: 检索关键词。
        max_results: 返回条数上限（内部 clamp 至 15）。
        language: 语言偏好；中文时默认仅调 baidu 引擎。

    Returns:
        格式化后的结果文本，或配置/连接/HTTP 错误说明。
    """
    q = (query or "").strip()
    if not q:
        return "请提供非空的检索关键词。"

    s = get_settings()
    base = (s.searxng_url or "").strip().rstrip("/")
    if not base:
        return "未配置 SEARXNG_URL：请在环境中设置 SearXNG 根地址，或启动 docker compose 中的 searxng 服务。"

    try:
        n = max(1, min(int(max_results), 15))
    except (TypeError, ValueError):
        n = 5

    lang = (language or "zh").strip() or "zh"
    params = {"q": q, "format": "json", "language": lang}
    # 中文默认只调百度引擎，国内网络通常可达，且避免境外引擎全超时导致久等无结果
    if lang.lower().startswith("zh"):
        params["engines"] = "baidu"
    timeout = httpx.Timeout(s.searxng_timeout_seconds)

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            r = await client.get(f"{base}/search", params=params)
    except httpx.HTTPError as exc:
        logger.warning("SearXNG 请求失败: %s", exc)
        return (
            f"无法连接 SearXNG（{base}）：{exc}。"
            "请确认已执行 `docker compose up -d searxng` 且端口与 SEARXNG_URL 一致。"
        )

    if r.status_code == 403:
        return (
            "SearXNG 拒绝了 JSON 格式请求（403）。"
            "请确认实例 settings.yml 中 search.formats 包含 json（见项目 docker/searxng/settings.yml）。"
        )
    if r.status_code != 200:
        return f"SearXNG 返回 HTTP {r.status_code}，无法完成检索。"

    try:
        payload = r.json()
    except json.JSONDecodeError:
        return "SearXNG 响应不是合法 JSON，无法解析。"

    if not isinstance(payload, dict):
        return "SearXNG JSON 结构异常。"

    return format_searx_results_for_llm(payload, n)
