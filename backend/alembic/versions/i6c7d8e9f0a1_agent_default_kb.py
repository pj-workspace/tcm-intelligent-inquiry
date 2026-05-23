"""agents.default_kb_id for per-agent knowledge base binding

Revision ID: i6c7d8e9f0a1
Revises: h5b6c7d8e9f0
Create Date: 2026-04-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i6c7d8e9f0a1"
down_revision: Union[str, Sequence[str], None] = "h5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    op.add_column(
        "agents",
        sa.Column("default_kb_id", sa.String(length=36), nullable=True),
    )


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_column("agents", "default_kb_id")
