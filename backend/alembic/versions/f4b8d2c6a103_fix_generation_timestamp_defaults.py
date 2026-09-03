"""fix unified generation timestamp defaults

Revision ID: f4b8d2c6a103
Revises: e2a6c8f4d901
Create Date: 2026-09-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f4b8d2c6a103"
down_revision: str | Sequence[str] | None = "e2a6c8f4d901"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = (
    "model_config_revisions",
    "generation_artifacts",
    "generation_task_media_references",
    "generation_dispatch_outbox",
)


def _set_timestamp_defaults(*, server_default: sa.ClauseElement | None) -> None:
    """统一调整 expand 阶段四张表的时间字段数据库默认值。"""
    for table_name in _TABLES:
        with op.batch_alter_table(table_name) as batch_op:
            for column_name in ("created_at", "updated_at"):
                batch_op.alter_column(
                    column_name,
                    existing_type=sa.DateTime(),
                    existing_nullable=False,
                    server_default=server_default,
                )


def upgrade() -> None:
    """为现有数据库补齐 ORM 声明所依赖的 CURRENT_TIMESTAMP 默认值。"""
    _set_timestamp_defaults(server_default=sa.func.now())


def downgrade() -> None:
    """移除本次补充的数据库默认值。"""
    _set_timestamp_defaults(server_default=None)
