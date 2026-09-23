"""Add independent frame references, durable call audits and official contract evidence."""
from alembic import op
import sqlalchemy as sa

revision = "b8c0d2e4f609"
down_revision = "a7b9c1d3e508"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add a nullable JSON extension without rewriting existing shot data."""
    op.add_column("shot_details", sa.Column("frame_reference_selections", sa.JSON(), nullable=True))
    op.create_table("generation_calls",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("task_id", sa.String(64), nullable=False),
        sa.Column("method", sa.String(12), nullable=False),
        sa.Column("endpoint", sa.String(2048), nullable=False),
        sa.Column("request", sa.JSON(), nullable=False),
        sa.Column("response", sa.JSON(), nullable=True),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_generation_calls_task_id", "generation_calls", ["task_id"])
    op.create_table("model_governance_records",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    """Remove this batch of reference preferences and audit/evidence tables only."""
    op.drop_table("model_governance_records")
    op.drop_table("generation_calls")
    op.drop_column("shot_details", "frame_reference_selections")
