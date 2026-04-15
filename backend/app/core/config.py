from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """从环境变量 / backend/.env 加载全局配置，无论从哪个目录启动均可正确解析。"""

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── DashScope ─────────────────────────────────────────────────────────────
    dashscope_api_key: str = Field(..., description="阿里云 DashScope API Key")
    qwen_chat_model: str = Field(
        default="qwen-plus", description="对话模型名（兼容 OpenAI 接口）"
    )
    qwen_embedding_model: str = Field(
        default="text-embedding-v3", description="DashScope 向量模型名"
    )
    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        description="兼容模式 Base URL",
    )

    # ── 基础设施（docker-compose 默认值见 .env.example）──────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://tcm:tcm_secret@127.0.0.1:5433/tcm",
        description="异步 SQLAlchemy 连接串",
    )
    redis_url: str = Field(
        default="redis://127.0.0.1:6379/0",
        description="Redis 连接串",
    )
    qdrant_url: str = Field(
        default="http://127.0.0.1:6333",
        description="Qdrant HTTP 地址",
    )
    # 未在工具参数中指定 kb_id 时使用；为空则自动选用数据库中第一个知识库
    default_knowledge_base_id: str = Field(
        default="",
        description="默认知识库 UUID（可选）",
    )

    # ── 服务 ──────────────────────────────────────────────────────────────────
    cors_origins: str = Field(
        default="http://localhost:3000", description="逗号分隔的允许跨域来源"
    )

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
