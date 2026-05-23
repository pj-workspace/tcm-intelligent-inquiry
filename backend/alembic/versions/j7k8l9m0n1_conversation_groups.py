"""conversation_groups and conversations.group_id

Revision ID: j7k8l9m0n1
Revises: i6c7d8e9f0a1
Create Date: 2026-04-29

首次执行若 `conversation_groups` 已存在（曾失败重试的库），会跳过建表并仅补全
`conversations.group_id` 与约束，避免 DuplicateTable 后列未创建。
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "j7k8l9m0n1"
down_revision: Union[str, Sequence[str], None] = "i6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_FK_CONV_GROUP = "fk_conversations_group_id_conversation_groups"


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("conversation_groups"):
        op.create_table(
            "conversation_groups",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=128), nullable=False),
            sa.Column(
                "sort_order", sa.Integer(), nullable=False, server_default="0"
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_conversation_groups_user_id"),
            "conversation_groups",
            ["user_id"],
        )

    conv_cols = {c["name"] for c in insp.get_columns("conversations")}
    if "group_id" not in conv_cols:
        op.add_column(
            "conversations",
            sa.Column("group_id", sa.String(length=36), nullable=True),
        )

    insp = sa.inspect(bind)
    idx_names = {i["name"] for i in insp.get_indexes("conversations")}
    ix_gid = op.f("ix_conversations_group_id")
    if ix_gid not in idx_names:
        op.create_index(ix_gid, "conversations", ["group_id"], unique=False)

    fk_names = {
        fk["name"]
        for fk in insp.get_foreign_keys("conversations")
        if fk.get("name")
    }
    if _FK_CONV_GROUP not in fk_names:
        op.create_foreign_key(
            _FK_CONV_GROUP,
            "conversations",
            "conversation_groups",
            ["group_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_constraint(_FK_CONV_GROUP, "conversations", type_="foreignkey")
    op.drop_index(op.f("ix_conversations_group_id"), table_name="conversations")
    op.drop_column("conversations", "group_id")
    op.drop_index(op.f("ix_conversation_groups_user_id"), table_name="conversation_groups")
    op.drop_table("conversation_groups")
