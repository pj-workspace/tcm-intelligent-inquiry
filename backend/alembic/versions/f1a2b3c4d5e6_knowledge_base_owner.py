"""knowledge base owner for multi-tenant isolation

Revision ID: f1a2b3c4d5e6
Revises: e6f7a8b9c0d1
Create Date: 2026-04-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "knowledge_bases",
        sa.Column("owner_id", sa.String(length=36), nullable=True),
    )
    op.create_foreign_key(
        "fk_knowledge_bases_owner_id_users",
        "knowledge_bases",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_knowledge_bases_owner_id", "knowledge_bases", ["owner_id"], unique=False
    )

    conn = op.get_bind()
    owner = conn.execute(
        sa.text("SELECT id FROM users ORDER BY id LIMIT 1")
    ).scalar()
    if owner:
        conn.execute(
            sa.text("UPDATE knowledge_bases SET owner_id = :o WHERE owner_id IS NULL"),
            {"o": owner},
        )
    conn.execute(sa.text("DELETE FROM knowledge_bases WHERE owner_id IS NULL"))

    op.alter_column("knowledge_bases", "owner_id", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_knowledge_bases_owner_id", table_name="knowledge_bases")
    op.drop_constraint("fk_knowledge_bases_owner_id_users", "knowledge_bases", type_="foreignkey")
    op.drop_column("knowledge_bases", "owner_id")
