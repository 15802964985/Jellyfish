"""add default audio model

Revision ID: d5f1a7c9e306
Revises: c3d7e9f1a204
Create Date: 2026-09-04
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d5f1a7c9e306"
down_revision: str | Sequence[str] | None = "c3d7e9f1a204"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """为全局运行设置新增默认语音模型槽位。"""

    with op.batch_alter_table("model_settings") as batch_op:
        batch_op.add_column(sa.Column("default_audio_model_id", sa.String(length=64), nullable=True))
        batch_op.create_index("ix_model_settings_default_audio_model_id", ["default_audio_model_id"])
        batch_op.create_foreign_key(
            "fk_model_settings_default_audio_model_id_models",
            "models",
            ["default_audio_model_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    """移除默认语音模型槽位，不删除任何模型记录。"""

    with op.batch_alter_table("model_settings") as batch_op:
        batch_op.drop_constraint(
            "fk_model_settings_default_audio_model_id_models",
            type_="foreignkey",
        )
        batch_op.drop_index("ix_model_settings_default_audio_model_id")
        batch_op.drop_column("default_audio_model_id")
