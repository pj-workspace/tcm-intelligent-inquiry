"""messages.follow_up_suggestions JSON

Revision ID: k0m1n2o3p4
Revises: j7k8l9m0n1
Create Date: 2026-04-29

持久化每条助手消息的「快速追问」建议，刷新会话后可还原。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "k0m1n2o3p4"
down_revision: Union[str, Sequence[str], None] = "j7k8l9m0n1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    op.add_column(
        "messages",
        sa.Column("follow_up_suggestions", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_column("messages", "follow_up_suggestions")
