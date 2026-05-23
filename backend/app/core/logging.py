"""结构化日志配置。

使用标准库 logging，格式包含时间、级别、模块，便于后续接入日志平台。
"""

import logging
import sys


def configure_logging(level: str = "INFO") -> None:
    """Configure root logging and suppress noisy third-party loggers."""
    logging.basicConfig(
        stream=sys.stdout,
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # 压制 LangChain / httpx 的 DEBUG 噪音
    for noisy in ("httpx", "httpcore", "langchain_core", "openai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a module-scoped logger."""
    return logging.getLogger(name)
