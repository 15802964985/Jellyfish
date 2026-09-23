"""Persistent browser account locks; no cookies or passwords stored in DB."""
from alembic import op
import sqlalchemy as sa
revision='a3c5e7f9b015'
down_revision='f2a4b6c8d014'
branch_labels=None
depends_on=None

def upgrade():
    """Create account identities without enabling or adding any real account."""
    op.create_table('web_generation_accounts',sa.Column('id',sa.String(64),primary_key=True),sa.Column('platform',sa.String(32),nullable=False),sa.Column('display_name',sa.String(120),nullable=False),sa.Column('enabled',sa.Boolean(),nullable=False),sa.Column('active_task_id',sa.String(64),nullable=True),sa.Column('session_state',sa.String(32),nullable=False,server_default='needs_login'),sa.Column('supported_models',sa.JSON(),nullable=False),sa.Column('heartbeat_at',sa.DateTime(),nullable=True),sa.Column('last_assigned_at',sa.DateTime(),nullable=True),sa.Column('profile_key',sa.String(64),nullable=True,unique=True),sa.Column('created_at',sa.DateTime(),server_default=sa.func.now(),nullable=False),sa.Column('updated_at',sa.DateTime(),server_default=sa.func.now(),nullable=False))

def downgrade():
    """Remove only the new account registry after explicit migration approval."""
    op.drop_table('web_generation_accounts')
