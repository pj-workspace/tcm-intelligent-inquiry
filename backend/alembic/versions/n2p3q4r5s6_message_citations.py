"""messages.citations JSON

Revision ID: n2p3q4r5s6
Revises: m9n0o1p2q3
Create Date: 2026-05-23

持久化助手消息引用来源，刷新会话后可还原来源面板与正文引用标记。
"""

from typing import Sequence, Union

from alembic import op

revision: str = "n2p3q4r5s6"
down_revision: Union[str, Sequence[str], None] = "m9n0o1p2q3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations JSON")


def downgrade() -> None:
    op.execute("ALTER TABLE messages DROP COLUMN IF EXISTS citations")
