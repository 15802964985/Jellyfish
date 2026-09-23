"""Persist project editing plans independently of source shots."""
from alembic import op
import sqlalchemy as sa

revision = "c9d1e3f5a701"
down_revision = "b8c0d2e4f609"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """新增空工程表，不改写已有项目或媒体。"""
    op.create_table("project_edits",
        sa.Column("project_id", sa.String(64), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("plan", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))


def downgrade() -> None:
    """回退仅移除剪辑工程表，源媒体和成片文件保留。"""
    op.drop_table("project_edits")
