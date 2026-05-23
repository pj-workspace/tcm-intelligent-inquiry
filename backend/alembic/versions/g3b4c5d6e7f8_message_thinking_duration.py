"""messages.duration_sec for thinking segments

Revision ID: g3b4c5d6e7f8
Revises: f2a2b3c4d5e7
Create Date: 2026-04-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a2b3c4d5e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    op.add_column(
        "messages",
        sa.Column("duration_sec", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_column("messages", "duration_sec")
