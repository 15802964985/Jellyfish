"""Separate provider display names from execution adapters without changing legacy rows."""
from alembic import op
import sqlalchemy as sa

revision = "a7b9c1d3e508"
down_revision = "f6a8b2c4d507"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Nullable extension preserves existing providers and their frozen task revisions."""
    op.add_column("providers", sa.Column("adapter_key", sa.String(64), nullable=True))


def downgrade() -> None:
    """Only remove the protocol extension; caller must restore compatible legacy names first."""
    op.drop_column("providers", "adapter_key")
