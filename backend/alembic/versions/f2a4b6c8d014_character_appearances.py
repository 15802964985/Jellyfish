"""同角色造型版本与镜头选择，只新增表。"""
from alembic import op
import sqlalchemy as sa
revision='f2a4b6c8d014'
down_revision='e1f3a5b7c903'
branch_labels=None
depends_on=None

def upgrade():
    """新增不可变版本和选用关系，不改旧角色、图片和镜头数据。"""
    op.create_table('character_appearances',sa.Column('id',sa.String(64),primary_key=True),
        sa.Column('character_id',sa.String(64),sa.ForeignKey('characters.id',ondelete='CASCADE'),nullable=False),
        sa.Column('version',sa.Integer(),nullable=False),sa.Column('name',sa.String(120),nullable=False),sa.Column('data',sa.JSON(),nullable=False),
        sa.Column('created_at',sa.DateTime(),server_default=sa.func.now(),nullable=False),sa.Column('updated_at',sa.DateTime(),server_default=sa.func.now(),nullable=False),
        sa.UniqueConstraint('character_id','version',name='uq_character_appearance_version'))
    op.create_index('ix_character_appearances_character_id','character_appearances',['character_id'])
    op.create_table('shot_character_appearances',
        sa.Column('shot_id',sa.String(64),sa.ForeignKey('shots.id',ondelete='CASCADE'),primary_key=True),
        sa.Column('character_id',sa.String(64),sa.ForeignKey('characters.id',ondelete='CASCADE'),primary_key=True),
        sa.Column('appearance_id',sa.String(64),sa.ForeignKey('character_appearances.id',ondelete='CASCADE'),nullable=False),
        sa.Column('created_at',sa.DateTime(),server_default=sa.func.now(),nullable=False),sa.Column('updated_at',sa.DateTime(),server_default=sa.func.now(),nullable=False))

def downgrade():
    """只撤销新关系表，不删除原角色和文件。"""
    op.drop_table('shot_character_appearances');op.drop_table('character_appearances')
