"""FastAPI 应用入口。

职责：
  - 创建 app 实例（lifespan、middleware）
  - 注册各域 router
  - 挂载全局异常处理器

不包含任何业务逻辑；所有实现在各业务域内部。
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.exceptions import AppError, app_error_handler
from app.core.logging import configure_logging, get_logger
from app.core.database import init_db

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    import asyncio

    await init_db()
    from app.core.database import async_session_factory
    from app.mcp.service import restore_mcp_tool_registrations

    async with async_session_factory() as session:
        from app.agent.tools.formula.seed import seed_formulas_if_empty

        await seed_formulas_if_empty(session)
        await restore_mcp_tool_registrations(session)
        await session.commit()
    s = get_settings()
    if len(s.jwt_secret) < 32 or s.jwt_secret == "dev-only-change-me-use-long-random-string":
        logger.warning(
            "JWT_SECRET 过短或为开发默认值，生产环境请替换为至少 32 字节的高强度随机串",
        )
    emb_p = (s.embedding_provider or s.llm_provider or "qwen").strip().lower()
    emb_model = (
        s.openai_embedding_model if emb_p == "openai" else s.qwen_embedding_model
    )
    logger.info(
        "TCM Intelligent Inquiry API 启动 | LLM_PROVIDER=%s | 嵌入厂商=%s 模型=%s | PG/Redis/Qdrant 见 /health/deps",
        s.llm_provider,
        emb_p,
        emb_model,
    )
    probe_task: asyncio.Task | None = None
    if s.mcp_probe_interval_seconds > 0:
        from app.mcp.health import run_mcp_probe_loop

        probe_task = asyncio.create_task(run_mcp_probe_loop())
    yield
    if probe_task:
        probe_task.cancel()
        try:
            await probe_task
        except asyncio.CancelledError:
            pass
    logger.info("API 服务关闭")


app = FastAPI(
    title="TCM Intelligent Inquiry API",
    description="面向中医领域的智能问询后端，支持 Agent 对话、知识库管理与 MCP 集成。",
    version="0.1.0",
    lifespan=lifespan,
)

# ── 全局异常处理 ──────────────────────────────────────────────────────────────
app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]

# ── CORS ──────────────────────────────────────────────────────────────────────
_s = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_s.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 中间件：SSE 响应补充 charset ───────────────────────────────────────────────
@app.middleware("http")
async def add_utf8_charset(request, call_next):
    response = await call_next(request)
    ct = response.headers.get("content-type", "")
    if ct.startswith("text/event-stream") and "charset" not in ct:
        response.headers["content-type"] = "text/event-stream; charset=utf-8"
    return response


# ── 路由注册（每个域的 router 在此聚合）──────────────────────────────────────
from app.agent.router import router as agent_router
from app.auth.router import router as auth_router
from app.chat.router import router as chat_router
from app.knowledge.router import router as knowledge_router
from app.mcp.router import router as mcp_router

app.include_router(chat_router)
app.include_router(agent_router)
app.include_router(knowledge_router)
app.include_router(mcp_router)
app.include_router(auth_router)


# ── 健康检查 ──────────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"], summary="服务健康检查")
async def health():
    return {"status": "ok", "version": app.version}


@app.get("/health/deps", tags=["system"], summary="检查 PostgreSQL / Redis / Qdrant 连通性")
async def health_deps():
    from sqlalchemy import text

    from qdrant_client import QdrantClient

    from app.core.database import engine
    from app.core.redis_client import ping_redis

    s = get_settings()
    out: dict[str, str] = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        out["postgres"] = "ok"
    except Exception as exc:
        logger.warning("health/deps postgres: %s", exc)
        out["postgres"] = "error"

    try:
        out["redis"] = "ok" if await ping_redis() else "fail"
    except Exception as exc:
        logger.warning("health/deps redis: %s", exc)
        out["redis"] = "error"

    try:
        QdrantClient(url=s.qdrant_url, check_compatibility=False).get_collections()
        out["qdrant"] = "ok"
    except Exception as exc:
        logger.warning("health/deps qdrant: %s", exc)
        out["qdrant"] = "error"

    return out
