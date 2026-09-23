"""Add versioned creative direction without rewriting legacy tasks or media."""
from alembic import op
import sqlalchemy as sa
revision = 'e1f3a5b7c903'
down_revision = 'd0e2f4a6b802'
branch_labels = None
depends_on = None

def upgrade():
    """只新增设定与版本表；旧数据补值由可审计迁移脚本单独执行。"""
    for table, history in [('creative_directions', False), ('creative_direction_revisions', True)]:
        op.create_table(table,
            sa.Column('scope', sa.String(24), primary_key=True),
            sa.Column('entity_id', sa.String(64), primary_key=True),
            sa.Column('revision', sa.Integer(), primary_key=history, nullable=False),
            sa.Column('data', sa.JSON(), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False))

def downgrade():
    """仅移除新设定；生成媒体和历史任务不受影响。"""
    op.drop_table('creative_direction_revisions')
    op.drop_table('creative_directions')
