"""Add isolated media execution checkpoints; existing tasks remain untouched."""
from alembic import op
import sqlalchemy as sa
revision = "d0e2f4a6b802"
down_revision = "c9d1e3f5a701"
branch_labels = None
depends_on = None

def upgrade():
    """Create private receipt storage without rewriting tasks or artifacts."""
    op.create_table("generation_recovery",
        sa.Column("task_id", sa.String(64), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))
    op.create_table("account_quota_records",
        sa.Column("model_id", sa.String(64), primary_key=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))


def downgrade():
    """Remove checkpoints only; never remove generated media or source tasks."""
    op.drop_table("account_quota_records")
    op.drop_table("generation_recovery")
