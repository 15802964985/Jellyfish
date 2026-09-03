"""add unified generation contracts storage foundation

Revision ID: d8f4a1e9b702
Revises: c6e2f4a9b301
Create Date: 2026-07-27
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "d8f4a1e9b702"
down_revision: str | Sequence[str] | None = "c6e2f4a9b301"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_column_if_missing(table: str, column: sa.Column[object]) -> None:
    """为开发数据库的可重复前向迁移补齐缺失列。"""
    if column.name not in {item["name"] for item in sa.inspect(op.get_bind()).get_columns(table)}:
        op.add_column(table, column)


def _json_object_default() -> sa.TextClause:
    """Return an empty JSON-object default accepted by the active database."""
    if op.get_bind().dialect.name == "mysql":
        # MySQL requires JSON defaults to be expressions, not string literals.
        return sa.text("(JSON_OBJECT())")
    return sa.text("'{}'")


def _create_table_if_missing(table: str, *elements: object) -> None:
    """Create a table once so MySQL's non-transactional DDL can be resumed."""
    if table not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(table, *elements)


def _create_index_if_missing(index: str, table: str, columns: list[str]) -> None:
    """Create an index once when resuming a partially applied migration."""
    index_names = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table)}
    if index not in index_names:
        op.create_index(index, table, columns)


def _artifact_content_constraints() -> tuple[sa.CheckConstraint, ...]:
    """Return constraints supported by the active database dialect."""
    if op.get_bind().dialect.name == "mysql":
        # MySQL rejects a CHECK that references a SET NULL foreign-key column.
        return ()
    return (
        sa.CheckConstraint(
            "(file_id IS NOT NULL AND text_content IS NULL) OR "
            "(file_id IS NULL AND text_content IS NOT NULL)",
            name="ck_generation_artifact_single_content",
        ),
    )


def upgrade() -> None:
    """扩展统一生成基础表，不删除旧 TaskLink 字段或旧 payload。"""
    _add_column_if_missing("generation_tasks", sa.Column("visibility", sa.String(32), nullable=False, server_default="task_center"))
    _add_column_if_missing("generation_tasks", sa.Column("lease_owner", sa.String(128), nullable=True))
    _add_column_if_missing("generation_tasks", sa.Column("lease_epoch", sa.Integer(), nullable=False, server_default="0"))
    _add_column_if_missing("generation_tasks", sa.Column("lease_expires_at", sa.DateTime(), nullable=True))
    _add_column_if_missing("generation_tasks", sa.Column("heartbeat_at", sa.DateTime(), nullable=True))
    index_names = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes("generation_tasks")}
    if "ix_generation_tasks_visibility_updated_at" not in index_names:
        op.create_index("ix_generation_tasks_visibility_updated_at", "generation_tasks", ["visibility", "updated_at"])

    _add_column_if_missing("models", sa.Column("current_revision_id", sa.String(64), nullable=True))
    model_index_names = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes("models")}
    if "ix_models_current_revision_id" not in model_index_names:
        op.create_index("ix_models_current_revision_id", "models", ["current_revision_id"])

    _create_table_if_missing(
        "model_config_revisions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("model_id", sa.String(64), sa.ForeignKey("models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Integer(), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("model_params", sa.JSON(), nullable=False, server_default=_json_object_default()),
        sa.Column("provider_key", sa.String(64), nullable=False),
        sa.Column("endpoint_config", sa.JSON(), nullable=False, server_default=_json_object_default()),
        sa.Column("capability_snapshot", sa.JSON(), nullable=False, server_default=_json_object_default()),
        sa.Column("credential_ref", sa.String(255), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("model_id", "version_id", name="uq_model_config_revisions_model_version"),
    )
    _create_index_if_missing(
        "ix_model_config_revisions_model_version",
        "model_config_revisions",
        ["model_id", "version_id"],
    )

    for table in ("actor_images", "character_images", "scene_images", "prop_images", "costume_images", "shot_frame_images"):
        _add_column_if_missing(table, sa.Column("version_id", sa.Integer(), nullable=False, server_default="1"))
    _add_column_if_missing("shots", sa.Column("generated_video_version_id", sa.Integer(), nullable=False, server_default="1"))
    _add_column_if_missing("files", sa.Column("content_version", sa.Integer(), nullable=False, server_default="1"))
    _add_column_if_missing("files", sa.Column("content_hash", sa.String(128), nullable=True))

    _create_table_if_missing(
        "generation_artifacts",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("task_id", sa.String(64), sa.ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=True),
        sa.Column("generation_run_id", sa.String(64), nullable=True),
        sa.Column("modality", sa.String(16), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("file_id", sa.String(64), sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("provider_result", sa.JSON(), nullable=False, server_default=_json_object_default()),
        sa.Column("publish_status", sa.String(16), nullable=False),
        sa.Column("publish_error", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "ordinal", name="uq_generation_artifacts_task_ordinal"),
        *_artifact_content_constraints(),
        sa.CheckConstraint("(publish_status = 'published' AND publish_error IS NULL) OR (publish_status = 'conflicted' AND publish_error = 'target_version_conflict') OR (publish_status = 'skipped' AND publish_error IS NOT NULL)", name="ck_generation_artifact_publish_status"),
    )
    _create_index_if_missing("ix_generation_artifacts_task_ordinal", "generation_artifacts", ["task_id", "ordinal"])
    _create_index_if_missing(
        "ix_generation_artifacts_generation_run_id",
        "generation_artifacts",
        ["generation_run_id"],
    )

    _create_table_if_missing(
        "generation_task_media_references",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(64), sa.ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_id", sa.String(64), sa.ForeignKey("files.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("group_path", sa.String(255), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("media_kind", sa.String(16), nullable=False),
        sa.Column("file_content_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("file_content_hash", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("task_id", "group_path", "ordinal", name="uq_generation_task_media_group_ordinal"),
    )
    _create_index_if_missing(
        "ix_generation_task_media_file_task",
        "generation_task_media_references",
        ["file_id", "task_id"],
    )

    _create_table_if_missing(
        "generation_dispatch_outbox",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.String(64), sa.ForeignKey("generation_tasks.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=_json_object_default()),
        sa.Column("dispatched_at", sa.String(64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    _create_index_if_missing(
        "ix_generation_dispatch_outbox_dispatched",
        "generation_dispatch_outbox",
        ["dispatched_at", "created_at"],
    )


def downgrade() -> None:
    """回退 P1 expand 表与列，供开发数据库重建时使用。"""
    op.drop_table("generation_dispatch_outbox")
    op.drop_table("generation_task_media_references")
    op.drop_table("generation_artifacts")
    op.drop_table("model_config_revisions")
    with op.batch_alter_table("files") as batch_op:
        batch_op.drop_column("content_hash")
        batch_op.drop_column("content_version")
    with op.batch_alter_table("shots") as batch_op:
        batch_op.drop_column("generated_video_version_id")
    for table in ("actor_images", "character_images", "scene_images", "prop_images", "costume_images", "shot_frame_images"):
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_column("version_id")
    op.drop_index("ix_models_current_revision_id", table_name="models")
    with op.batch_alter_table("models") as batch_op:
        batch_op.drop_column("current_revision_id")
    op.drop_index("ix_generation_tasks_visibility_updated_at", table_name="generation_tasks")
    with op.batch_alter_table("generation_tasks") as batch_op:
        batch_op.drop_column("heartbeat_at")
        batch_op.drop_column("lease_expires_at")
        batch_op.drop_column("lease_epoch")
        batch_op.drop_column("lease_owner")
        batch_op.drop_column("visibility")
