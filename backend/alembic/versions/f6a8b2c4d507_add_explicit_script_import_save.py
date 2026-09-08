"""add explicit script import save flag

Revision ID: f6a8b2c4d507
Revises: d5f1a7c9e306
Create Date: 2026-09-07
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f6a8b2c4d507"
down_revision: str | Sequence[str] | None = "d5f1a7c9e306"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Preserve existing drafts while making newly parsed previews unsaved by default."""

    op.add_column(
        "script_imports",
        sa.Column("is_saved", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(sa.text("UPDATE script_imports SET is_saved = 1"))
    op.create_index("ix_script_imports_is_saved", "script_imports", ["is_saved"])


def downgrade() -> None:
    """Remove explicit-save tracking without deleting import records."""

    op.drop_index("ix_script_imports_is_saved", table_name="script_imports")
    op.drop_column("script_imports", "is_saved")
