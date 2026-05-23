"""messages.model_name for assistant replies

Revision ID: h5b6c7d8e9f0
Revises: g3b4c5d6e7f8
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h5b6c7d8e9f0"
down_revision: Union[str, Sequence[str], None] = "g3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    op.add_column(
        "messages",
        sa.Column("model_name", sa.String(length=256), nullable=True),
    )


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_column("messages", "model_name")
