"""mcp_servers: transport + stdio_config, url nullable

Revision ID: m9n0o1p2q3
Revises: l8n9o0p1q2
Create Date: 2026-05-20

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m9n0o1p2q3"
down_revision: Union[str, Sequence[str], None] = "l8n9o0p1q2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mcp_servers",
        sa.Column("transport", sa.String(length=16), nullable=False, server_default="http"),
    )
    op.add_column(
        "mcp_servers",
        sa.Column("stdio_config", sa.JSON(), nullable=True),
    )
    op.alter_column("mcp_servers", "url", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("mcp_servers", "url", existing_type=sa.Text(), nullable=False)
    op.drop_column("mcp_servers", "stdio_config")
    op.drop_column("mcp_servers", "transport")
