"""llm_usage_events + provider_balance_snapshots

Revision ID: l8n9o0p1q2
Revises: k0m1n2o3p4
Create Date: 2026-05-18

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "l8n9o0p1q2"
down_revision: Union[str, Sequence[str], None] = "k0m1n2o3p4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "llm_usage_events" not in tables:
        op.create_table(
            "llm_usage_events",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("user_id", sa.String(length=36), nullable=True),
            sa.Column("conversation_id", sa.String(length=36), nullable=True),
            sa.Column("provider_id", sa.String(length=32), nullable=False),
            sa.Column("chat_model", sa.String(length=256), nullable=True),
            sa.Column("graph_run_id", sa.String(length=128), nullable=True),
            sa.Column("prompt_tokens", sa.Integer(), nullable=True),
            sa.Column("completion_tokens", sa.Integer(), nullable=True),
            sa.Column("total_tokens", sa.Integer(), nullable=True),
            sa.Column("reasoning_tokens", sa.Integer(), nullable=True),
            sa.Column("cached_prompt_tokens", sa.Integer(), nullable=True),
            sa.Column("usage_raw", JSONB(astext_type=sa.Text()), nullable=False),
            sa.Column("usage_normalized", JSONB(astext_type=sa.Text()), nullable=False),
            sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    # 兼容已由 metadata.create_all 建表但缺少索引的旧库
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_llm_usage_events_user_id ON llm_usage_events (user_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_llm_usage_events_conversation_id ON llm_usage_events (conversation_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_llm_usage_events_provider_id ON llm_usage_events (provider_id)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_llm_usage_events_user_created ON llm_usage_events (user_id, created_at)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_llm_usage_events_conv_created ON llm_usage_events (conversation_id, created_at)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_llm_usage_events_provider_created ON llm_usage_events (provider_id, created_at)"
        )
    )

    if "provider_balance_snapshots" not in tables:
        op.create_table(
            "provider_balance_snapshots",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("provider_id", sa.String(length=32), nullable=False),
            sa.Column("fetched_by_user_id", sa.String(length=36), nullable=False),
            sa.Column("is_available", sa.Boolean(), nullable=True),
            sa.Column("payload", JSONB(astext_type=sa.Text()), nullable=False),
            sa.ForeignKeyConstraint(["fetched_by_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_provider_balance_snapshots_provider_created ON provider_balance_snapshots (provider_id, created_at)"
        )
    )
    op.execute(
        sa.text(
            "CREATE INDEX IF NOT EXISTS ix_provider_balance_snapshots_user_created ON provider_balance_snapshots (fetched_by_user_id, created_at)"
        )
    )


def downgrade() -> None:
    """Revert schema changes."""
    # 与 upgrade 中 CREATE IF NOT EXISTS 对称，避免手工删改过对象时 downgrade 报错
    for stmt in (
        "DROP INDEX IF EXISTS ix_provider_balance_snapshots_user_created",
        "DROP INDEX IF EXISTS ix_provider_balance_snapshots_provider_created",
        "DROP TABLE IF EXISTS provider_balance_snapshots",
        "DROP INDEX IF EXISTS ix_llm_usage_events_provider_created",
        "DROP INDEX IF EXISTS ix_llm_usage_events_conv_created",
        "DROP INDEX IF EXISTS ix_llm_usage_events_user_created",
        "DROP INDEX IF EXISTS ix_llm_usage_events_provider_id",
        "DROP INDEX IF EXISTS ix_llm_usage_events_conversation_id",
        "DROP INDEX IF EXISTS ix_llm_usage_events_user_id",
        "DROP TABLE IF EXISTS llm_usage_events",
    ):
        op.execute(sa.text(stmt))
