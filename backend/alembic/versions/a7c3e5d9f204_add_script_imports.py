"""add reviewable script imports

Revision ID: a7c3e5d9f204
Revises: f4b8d2c6a103
Create Date: 2026-09-04
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "a7c3e5d9f204"
down_revision: str | Sequence[str] | None = "f4b8d2c6a103"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "script_imports",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("project_id", sa.String(64), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_id", sa.String(64), sa.ForeignKey("files.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="parsed"),
        sa.Column("source_format", sa.String(32), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("parser_version", sa.String(32), nullable=False),
        sa.Column("document_profile", sa.String(32), nullable=False, server_default="unknown"),
        sa.Column("parse_result", sa.JSON(), nullable=False),
        sa.Column("analysis_result", sa.JSON(), nullable=False),
        sa.Column("review_state", sa.JSON(), nullable=False),
        sa.Column("commit_result", sa.JSON(), nullable=False),
        # MySQL rejects DEFAULT values on TEXT; ORM writes an explicit empty string.
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "content_hash", "parser_version", name="uq_script_import_project_content_parser"),
    )
    op.create_index("ix_script_imports_project_id", "script_imports", ["project_id"])
    op.create_index("ix_script_imports_file_id", "script_imports", ["file_id"])
    op.create_index("ix_script_imports_status", "script_imports", ["status"])
    op.create_index("ix_script_imports_project_created", "script_imports", ["project_id", "created_at"])


def downgrade() -> None:
    op.drop_table("script_imports")
