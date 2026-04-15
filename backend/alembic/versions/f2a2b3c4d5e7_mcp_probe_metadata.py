"""mcp server last probe time and error for health visibility

Revision ID: f2a2b3c4d5e7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f2a2b3c4d5e7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mcp_servers",
        sa.Column("last_probe_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "mcp_servers",
        sa.Column("last_probe_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mcp_servers", "last_probe_error")
    op.drop_column("mcp_servers", "last_probe_at")
