"""anonymous session secret for IDOR mitigation

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-04-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    op.add_column(
        "conversations",
        sa.Column("anon_session_secret", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_column("conversations", "anon_session_secret")
