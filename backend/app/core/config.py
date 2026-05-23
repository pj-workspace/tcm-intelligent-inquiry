from __future__ import annotations

"""应用全局配置：从环境变量与 ``backend/.env`` 加载，支持多 LLM 厂商与基础设施连接串。"""

from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.qwen_chat_options import (
    QwenChatModelOptionRow,
    parse_qwen_chat_model_options,
)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """从环境变量 / backend/.env 加载全局配置，无论从哪个目录启动均可正确解析。"""

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── 对话模型厂商（llm_provider）────────────────────────────────────────────
    llm_provider: str = Field(
        default="qwen",
        description="qwen | openai | anthropic | glm | deepseek",
    )
    # 向量嵌入可独立指定；空字符串时：llm 为 qwen/openai 则与其一致，
    # 为 deepseek/glm/anthropic 时自动选用 qwen（有 DASHSCOPE_API_KEY）或 openai（有 OPENAI_API_KEY）
    embedding_provider: str = Field(
        default="",
        description="qwen | openai；留空则按 LLM_PROVIDER 解析（非 qwen/openai 时自动回落到可用的嵌入厂商）",
    )

    # ── 阿里云 DashScope（通义千问对话 + 默认向量嵌入）──────────────────────────
    dashscope_api_key: str = Field(
        default="",
        description="DashScope API Key；llm_provider=qwen 或知识库嵌入必填",
    )
    qwen_chat_model: str = Field(
        default="qwen-plus", description="对话模型名（兼容 OpenAI 接口）"
    )
    qwen_chat_model_options: str = Field(
        default="",
        description="可选：单行 JSON 数组；非空时必须合法且恰好一项 default:true（见 README）",
    )
    qwen_vl_attachment_suggestions_model: str = Field(
        default="qwen3-vl-flash",
        description="附图快捷话术：看图生成建议所用的 DashScope VL 模型 id（与主对话模型独立）",
    )
    qwen_follow_up_suggestions_model: str = Field(
        default="qwen-flash",
        description="助手气泡下追问快捷话术（纯文本）；与主对话所选模型独立，默认 qwen-flash",
    )
    qwen_embedding_model: str = Field(
        default="text-embedding-v3", description="DashScope 向量模型名"
    )
    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        description="兼容模式 Base URL",
    )
    # 检索重排序（DashScope gte-rerank，与向量同一 API Key）
    rerank_enabled: bool = Field(default=True, description="是否在向量召回后做重排序")
    dashscope_rerank_model: str = Field(
        default="gte-rerank",
        description="DashScope 重排序模型名",
    )
    rerank_candidate_multiplier: int = Field(
        default=4,
        ge=2,
        le=10,
        description="相对 top_k 的召回倍数（先多召回再重排）",
    )
    rerank_max_candidates: int = Field(
        default=40,
        ge=10,
        le=100,
        description="单次检索送入重排序的最大候选条数上限",
    )

    # ── OpenAI 官方 API ────────────────────────────────────────────────────────
    openai_api_key: str = Field(default="", description="OPENAI_API_KEY")
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        description="OpenAI 兼容 Base URL",
    )
    openai_chat_model: str = Field(default="gpt-4o-mini", description="对话模型名")
    openai_embedding_model: str = Field(
        default="text-embedding-3-small",
        description="OpenAI 向量模型名（llm_provider=openai 时知识库嵌入使用）",
    )

    # ── Anthropic Claude ───────────────────────────────────────────────────────
    anthropic_api_key: str = Field(default="", description="ANTHROPIC_API_KEY")
    anthropic_chat_model: str = Field(
        default="claude-3-5-sonnet-20241022",
        description="Claude 模型名",
    )

    # ── 智谱 GLM（OpenAI 兼容接口）──────────────────────────────────────────────
    zhipu_api_key: str = Field(default="", description="智谱 AI API Key")
    glm_base_url: str = Field(
        default="https://open.bigmodel.cn/api/paas/v4",
        description="智谱 OpenAI 兼容 Base URL",
    )
    glm_chat_model: str = Field(default="glm-4", description="GLM 对话模型名")

    # ── DeepSeek（OpenAI 兼容接口）────────────────────────────────────────────
    deepseek_api_key: str = Field(default="", description="DeepSeek API Key")
    deepseek_base_url: str = Field(
        default="https://api.deepseek.com/v1",
        description="DeepSeek Base URL",
    )
    deepseek_chat_model: str = Field(
        default="deepseek-v4-flash",
        description="对话模型 id（如 deepseek-v4-flash / deepseek-v4-pro）；须在服务端内置清单内",
    )

    # ── 基础设施（docker-compose 默认值见 .env.example）──────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://tcm:tcm_secret@127.0.0.1:5434/tcm",
        description="异步 SQLAlchemy 连接串",
    )
    redis_url: str = Field(
        default="redis://127.0.0.1:6381/0",
        description="Redis 连接串",
    )
    # 异步入库：True 时走 Celery worker；False 时用 FastAPI BackgroundTasks（无需单独 worker）
    celery_ingest_enabled: bool = Field(
        default=True,
        description="是否用 Celery 执行 ingest-async 任务",
    )
    qdrant_url: str = Field(
        default="http://127.0.0.1:7333",
        description="Qdrant HTTP 地址",
    )
    # 未在工具参数中指定 kb_id 时使用；为空则自动选用数据库中第一个知识库
    default_knowledge_base_id: str = Field(
        default="",
        description="默认知识库 UUID（可选）",
    )

    # ── 可选全局 API Key（除 JWT 外对敏感路由二次校验；留空则不启用）────────────────
    api_key: str = Field(
        default="",
        description="非空时，知识库等受保护接口除 Authorization 外需 Header: X-API-Key",
    )

    # ── JWT（登录鉴权）────────────────────────────────────────────────────────
    jwt_secret: str = Field(
        default="dev-only-change-me-use-long-random-string",
        description="HS256 密钥，生产环境务必修改",
    )
    jwt_expire_minutes: int = Field(default=10080, description="Token 有效期（分钟），默认 7 天")

    # ── OAuth（GitHub / Gitee）与前端回跳 ───────────────────────────────────────
    frontend_url: str = Field(
        default="http://localhost:3000",
        description="SPA 前端根 URL（OAuth 302、cookies 同源）",
    )
    github_client_id: str = Field(default="", description="GitHub OAuth Client ID")
    github_client_secret: str = Field(default="", description="GitHub OAuth Client Secret")
    github_redirect_uri: str = Field(
        default="http://localhost:8001/api/auth/oauth/github/callback",
        description="须与 GitHub OAuth App Authorization callback URL 完全一致（开发与文档常用 localhost，勿与 127.0.0.1 混用）",
    )
    gitee_client_id: str = Field(default="", description="Gitee OAuth Client ID")
    gitee_client_secret: str = Field(default="", description="Gitee OAuth Client Secret")
    gitee_redirect_uri: str = Field(
        default="http://localhost:8001/api/auth/oauth/gitee/callback",
        description="须与 Gitee 应用回调地址完全一致（开发与文档常用 localhost）",
    )

    # ── 邮件 SMTP（验证码发信）；未配置 mail_host 时在开发环境仍可仅写 Redis + 日志 ─
    mail_host: str = Field(default="", description="SMTP 主机，空则不落真实投递")
    mail_port: int = Field(default=465)
    mail_username: str = Field(default="")
    mail_code: str = Field(default="", description="SMTP 授权码")
    mail_skip_send: bool = Field(
        default=False,
        description="为 True 时跳过 SMTP，仅写入 Redis（联调）",
    )

    # ── 数据库初始化：生产环境建议 false，仅使用 Alembic 迁移 ─────────────────
    database_auto_create_tables: bool = Field(
        default=True,
        description="启动时是否执行 metadata.create_all；生产建议 false",
    )

    # ── 知识库上传 ────────────────────────────────────────────────────────────
    max_upload_bytes: int = Field(
        default=50 * 1024 * 1024,
        ge=1024,
        description="单次上传文件最大字节数（同步/异步入库）",
    )
    ingest_temp_dir: str = Field(
        default="",
        description="异步入库临时文件目录，空则使用 backend/data/ingest_tmp；Celery 任务优先写磁盘而非 Redis",
    )

    # ── 知识库分块 ────────────────────────────────────────────────────────────
    knowledge_chunk_size: int = Field(
        default=512,
        ge=200,
        le=4096,
        description="向量分块目标长度（字符量级）",
    )
    knowledge_chunk_overlap: int = Field(
        default=64,
        ge=0,
        le=1024,
        description="分块重叠长度",
    )
    knowledge_chunk_presplit_sections: bool = Field(
        default=True,
        description="入库前按 Markdown ## / 章节标题粗分，再递归细切（利于条文类文献）",
    )

    # ── MCP 周期探测（应用进程内 asyncio 任务，0 表示关闭）────────────────────
    mcp_probe_interval_seconds: int = Field(
        default=300,
        ge=0,
        description="已启用 MCP 的周期发现/健康探测间隔（秒），0 关闭",
    )
    mcp_probe_concurrency: int = Field(
        default=4,
        ge=1,
        le=32,
        description="周期探测时对多个 MCP 并发 discover_tools 的上限，减轻慢节点串行叠加阻塞",
    )

    # ── 阿里云 OSS（对话图片上传、供 VL 等拉取时用签名 GET URL）────────────────
    aliyun_oss_access_key_id: str = Field(
        default="",
        description="OSS RAM AccessKey Id（与 DashScope Key 分开配置）",
    )
    aliyun_oss_access_key_secret: str = Field(default="", description="OSS RAM Secret")
    aliyun_oss_endpoint: str = Field(
        default="",
        description="地域 Endpoint，如 https://oss-cn-beijing.aliyuncs.com",
    )
    aliyun_oss_bucket: str = Field(default="", description="Bucket 名称")
    aliyun_oss_chat_prefix: str = Field(
        default="chat-uploads/",
        description="聊天图片对象键前缀，建议以 / 结尾",
    )
    aliyun_oss_sign_url_expires_seconds: int = Field(
        default=3600,
        ge=60,
        le=86400,
        description="上传返回的读取签名 URL 有效期（秒）；供 DashScope 拉图",
    )
    oss_chat_image_max_bytes: int = Field(
        default=8 * 1024 * 1024,
        ge=512_000,
        le=48 * 1024 * 1024,
        description="聊天图片单次上传最大字节（默认 8MB）",
    )

    # ── SearXNG（自托管元搜索，docker compose 服务 searxng 默认映射 9888）────
    searxng_url: str = Field(
        default="http://127.0.0.1:9888",
        description="SearXNG 根 URL；设为空字符串可禁用联网检索请求",
    )
    searxng_timeout_seconds: float = Field(
        default=10.0,
        ge=3.0,
        le=120.0,
        description="调用 SearXNG /search 的超时（秒），宜与容器内 outgoing.request_timeout 同量级以免久等",
    )

    # ── 诊断日志（慎用：打印完整用户内容与图片 URL）──────────────────────────
    ai_chat_trace_log: bool = Field(
        default=False,
        description="为 True 时在日志中输出主对话链路的完整原始数据（messages 全量、每帧 stream chunk、工具原始入出、流式聚合无截断）；环境变量 AI_CHAT_TRACE_LOG",
    )

    # ── 服务 ──────────────────────────────────────────────────────────────────
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        description="逗号分隔的允许跨域来源（开发时 localhost 与 127.0.0.1 均需列入，否则另一侧无法拉模型列表）",
    )

    def cors_origin_list(self) -> list[str]:
        """Cors origin list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @field_validator("qwen_chat_model_options", mode="before")
    @classmethod
    def _coerce_qwen_options_blank(cls, v: object) -> object:
        """Internal helper: coerce qwen options blank."""
        if v is None:
            return ""
        return v

    @model_validator(mode="after")
    def _validate_qwen_options_json(self) -> Settings:
        """Internal helper: validate qwen options json."""
        raw = (self.qwen_chat_model_options or "").strip()
        if raw:
            parse_qwen_chat_model_options(raw)
        return self

    def database_url_sync(self) -> str:
        """供 Alembic / 同步脚本使用（psycopg2）。"""
        u = self.database_url
        if "postgresql+asyncpg://" in u:
            return u.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        return u


def get_settings() -> Settings:
    """每次调用重新读取环境变量与 `backend/.env`（支持热切换，无需重启 API 进程）。"""
    return Settings()


def list_qwen_chat_model_option_rows(settings: Settings | None = None) -> list[QwenChatModelOptionRow]:
    """List qwen chat model option rows (``settings``)."""
    s = settings or get_settings()
    return parse_qwen_chat_model_options(s.qwen_chat_model_options)


def primary_qwen_chat_model(settings: Settings | None = None) -> str:
    """配置了 OPTIONS 时取唯一 default:true 的 id，否则退回 QWEN_CHAT_MODEL。"""
    s = settings or get_settings()
    opts = list_qwen_chat_model_option_rows(s)
    if opts:
        for row in opts:
            if row.default:
                return row.id
        return opts[0].id
    return (s.qwen_chat_model or "").strip()


def qwen_option_for_model_id(
    model_id: str,
    *,
    settings: Settings | None = None,
) -> QwenChatModelOptionRow | None:
    """Qwen option for model id。"""
    mid = (model_id or "").strip()
    if not mid:
        return None
    for row in list_qwen_chat_model_option_rows(settings):
        if row.id == mid:
            return row
    return None


def active_chat_model_label(
    chat_model_id: str | None = None,
    *,
    llm_provider: str | None = None,
) -> str:
    """展示用标签：qwen / deepseek 传入本轮 effective id 时返回 OPTIONS / 内置清单对应 label。"""
    s = get_settings()
    p = (llm_provider or "").strip().lower() or (s.llm_provider or "qwen").strip().lower()

    if p == "deepseek":
        from app.core.deepseek_chat_options import deepseek_option_for_model_id

        mid = (chat_model_id or "").strip()
        if not mid:
            mid = (s.deepseek_chat_model or "").strip() or "deepseek-v4-flash"
        hit = deepseek_option_for_model_id(mid)
        if hit is not None:
            return hit.label
        return mid

    def _fallback_non_qwen() -> str:
        """Internal helper: fallback non qwen."""
        if p == "openai":
            return s.openai_chat_model
        if p == "anthropic":
            return s.anthropic_chat_model
        if p == "glm":
            return s.glm_chat_model
        return s.qwen_chat_model

    if p != "qwen":
        mid = (chat_model_id or "").strip()
        if mid:
            return mid
        return _fallback_non_qwen()

    opts = list_qwen_chat_model_option_rows(s)
    mid = chat_model_id
    if mid is None:
        mid = primary_qwen_chat_model(s)

    if opts:
        hit = qwen_option_for_model_id(mid, settings=s)
        if hit is not None:
            from app.chat.model_display import short_model_list_label

            return short_model_list_label("qwen", hit.label, mid)
        return mid

    return s.qwen_chat_model
