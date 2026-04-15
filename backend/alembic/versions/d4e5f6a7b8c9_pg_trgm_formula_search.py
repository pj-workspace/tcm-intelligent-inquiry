"""pg_trgm 扩展 + 方剂检索表达式 GIN 索引（不改 formulas 列）

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-15

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # 供 similarity / % 使用；表达式与 service 中拼接字段一致
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_formulas_trgm_search_blob ON formulas
        USING gin ((
            COALESCE(indications, '') || ' ' || COALESCE(efficacy, '') || ' ' || COALESCE(composition, '')
            || ' ' || COALESCE(name, '') || ' ' || COALESCE(pattern_tags::text, '') || ' '
            || COALESCE(symptom_keywords::text, '')
        ) gin_trgm_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_formulas_trgm_search_blob")
    # 不 DROP EXTENSION pg_trgm，以免同库其他对象依赖
