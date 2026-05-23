"""formulas table for TCM prescription data

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Apply schema changes."""
    op.create_table(
        "formulas",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("aliases", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("composition", sa.Text(), nullable=False),
        sa.Column("efficacy", sa.Text(), nullable=False),
        sa.Column("indications", sa.Text(), nullable=False),
        sa.Column("pattern_tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("symptom_keywords", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_ref", sa.String(length=256), nullable=False, server_default=""),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_formulas_name", "formulas", ["name"], unique=False)


def downgrade() -> None:
    """Revert schema changes."""
    op.drop_index("ix_formulas_name", table_name="formulas")
    op.drop_table("formulas")
