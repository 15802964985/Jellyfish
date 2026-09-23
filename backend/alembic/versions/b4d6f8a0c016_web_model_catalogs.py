"""Persist editable website catalogs without changing existing account/task identities."""
from alembic import op
import sqlalchemy as sa
revision = 'b4d6f8a0c016'
down_revision = 'a3c5e7f9b015'
branch_labels = None
depends_on = None


def upgrade():
    """Add one versioned policy row per platform and image/video scope."""
    op.create_table('web_model_catalogs', sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('revision', sa.Integer(), nullable=False), sa.Column('entries', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False))


def downgrade():
    """Remove the new catalog only when an explicit rollback permits losing its policy."""
    op.drop_table('web_model_catalogs')
