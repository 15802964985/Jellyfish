"""统一生成 P1 expand 迁移的 SQLite 升降级测试。"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load_migration_module(filename: str = "d8f4a1e9b702_add_unified_generation_foundation.py"):
    """直接加载指定迁移版本文件，避免测试依赖 Alembic 目录包结构。"""

    migration_path = Path(__file__).parents[1] / "alembic/versions" / filename
    spec = importlib.util.spec_from_file_location("unified_generation_expand_migration", migration_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create_pre_expand_schema(engine: sa.Engine) -> None:
    """创建 P1 迁移所需的最小旧版表结构。"""

    metadata = sa.MetaData()
    sa.Table(
        "generation_tasks",
        metadata,
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    sa.Table("models", metadata, sa.Column("id", sa.String(64), primary_key=True))
    sa.Table("files", metadata, sa.Column("id", sa.String(64), primary_key=True))
    sa.Table("shots", metadata, sa.Column("id", sa.String(64), primary_key=True))
    for table_name in (
        "actor_images",
        "character_images",
        "scene_images",
        "prop_images",
        "costume_images",
        "shot_frame_images",
    ):
        sa.Table(table_name, metadata, sa.Column("id", sa.Integer(), primary_key=True))
    metadata.create_all(engine)


def test_unified_generation_expand_migration_upgrades_and_downgrades_sqlite(tmp_path) -> None:
    """P1 expand 迁移应在 SQLite 旧库上完整增加并移除约定的结构。"""

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'unified-generation-expand.db'}", future=True)
    _create_pre_expand_schema(engine)
    migration = _load_migration_module()

    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        # MySQL DDL is non-transactional; a failed deployment must be able to
        # resume after some columns, tables, or indexes were already created.
        migration.upgrade()

        inspector = sa.inspect(connection)
        task_columns = {column["name"] for column in inspector.get_columns("generation_tasks")}
        assert {"visibility", "lease_owner", "lease_epoch", "lease_expires_at", "heartbeat_at"} <= task_columns
        assert "current_revision_id" in {column["name"] for column in inspector.get_columns("models")}
        assert {"content_version", "content_hash"} <= {
            column["name"] for column in inspector.get_columns("files")
        }
        assert "generated_video_version_id" in {
            column["name"] for column in inspector.get_columns("shots")
        }
        assert all(
            "version_id" in {column["name"] for column in inspector.get_columns(table_name)}
            for table_name in (
                "actor_images",
                "character_images",
                "scene_images",
                "prop_images",
                "costume_images",
                "shot_frame_images",
            )
        )
        assert {
            "model_config_revisions",
            "generation_artifacts",
            "generation_task_media_references",
            "generation_dispatch_outbox",
        } <= set(inspector.get_table_names())

        # 生产任务提交不会显式填写 TimestampMixin 字段。迁移表必须提供数据库
        # 默认值，否则 outbox INSERT 会回滚任务，前端只会看到 Failed to fetch。
        connection.execute(
            sa.text(
                "INSERT INTO generation_tasks (id, updated_at) "
                "VALUES (:id, CURRENT_TIMESTAMP)"
            ),
            {"id": "timestamp-default-regression"},
        )
        connection.execute(
            sa.text(
                "INSERT INTO generation_dispatch_outbox (task_id, payload) "
                "VALUES (:task_id, '{}')"
            ),
            {"task_id": "timestamp-default-regression"},
        )
        timestamps = connection.execute(
            sa.text(
                "SELECT created_at, updated_at FROM generation_dispatch_outbox "
                "WHERE task_id = :task_id"
            ),
            {"task_id": "timestamp-default-regression"},
        ).one()
        assert timestamps.created_at is not None
        assert timestamps.updated_at is not None

        migration.downgrade()

        inspector = sa.inspect(connection)
        assert {
            "model_config_revisions",
            "generation_artifacts",
            "generation_task_media_references",
            "generation_dispatch_outbox",
        }.isdisjoint(inspector.get_table_names())
        assert "visibility" not in {
            column["name"] for column in inspector.get_columns("generation_tasks")
        }
        assert "current_revision_id" not in {
            column["name"] for column in inspector.get_columns("models")
        }
        assert "content_version" not in {column["name"] for column in inspector.get_columns("files")}

    engine.dispose()


def test_timestamp_default_repair_migration_upgrades_existing_tables(tmp_path) -> None:
    """修复迁移应为旧表补默认值，使任务发件箱可省略时间字段写入。"""

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'timestamp-repair.db'}", future=True)
    metadata = sa.MetaData()
    for table_name in (
        "model_config_revisions",
        "generation_artifacts",
        "generation_task_media_references",
        "generation_dispatch_outbox",
    ):
        sa.Table(
            table_name,
            metadata,
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
    metadata.create_all(engine)
    migration = _load_migration_module("f4b8d2c6a103_fix_generation_timestamp_defaults.py")

    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        defaults = {
            column["name"]: column["default"]
            for column in sa.inspect(connection).get_columns("generation_dispatch_outbox")
        }
        assert defaults["created_at"] is not None
        assert defaults["updated_at"] is not None
        connection.execute(sa.text("INSERT INTO generation_dispatch_outbox (id) VALUES (1)"))
        timestamps = connection.execute(
            sa.text("SELECT created_at, updated_at FROM generation_dispatch_outbox WHERE id = 1")
        ).one()
        assert timestamps.created_at is not None
        assert timestamps.updated_at is not None

    engine.dispose()


def test_explicit_script_import_save_migration_preserves_old_drafts(tmp_path) -> None:
    """旧导入记录应保留为已保存，新记录则默认只是临时预览。"""

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'script-import-save.db'}", future=True)
    metadata = sa.MetaData()
    sa.Table(
        "script_imports",
        metadata,
        sa.Column("id", sa.String(64), primary_key=True),
    )
    metadata.create_all(engine)
    migration = _load_migration_module("f6a8b2c4d507_add_explicit_script_import_save.py")

    with engine.begin() as connection:
        connection.execute(sa.text("INSERT INTO script_imports (id) VALUES ('legacy-draft')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        assert connection.execute(
            sa.text("SELECT is_saved FROM script_imports WHERE id = 'legacy-draft'")
        ).scalar_one() == 1
        connection.execute(sa.text("INSERT INTO script_imports (id) VALUES ('temporary-preview')"))
        assert connection.execute(
            sa.text("SELECT is_saved FROM script_imports WHERE id = 'temporary-preview'")
        ).scalar_one() == 0
        assert "ix_script_imports_is_saved" in {
            index["name"] for index in sa.inspect(connection).get_indexes("script_imports")
        }

        migration.downgrade()
        assert "is_saved" not in {
            column["name"] for column in sa.inspect(connection).get_columns("script_imports")
        }

    engine.dispose()


def test_model_revision_backfill_migration_makes_legacy_models_executable(tmp_path) -> None:
    """历史模型应补建安全 revision，已有 revision 则只恢复当前指针。"""

    engine = sa.create_engine(f"sqlite:///{tmp_path / 'model-revision-backfill.db'}", future=True)
    metadata = sa.MetaData()
    sa.Table(
        "providers",
        metadata,
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("base_url", sa.String(1024), nullable=False),
        sa.Column("image_base_url", sa.String(1024)),
        sa.Column("video_base_url", sa.String(1024)),
    )
    sa.Table(
        "models",
        metadata,
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("provider_id", sa.String(64), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("current_revision_id", sa.String(64)),
    )
    sa.Table(
        "model_config_revisions",
        metadata,
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("model_id", sa.String(64), nullable=False),
        sa.Column("version_id", sa.Integer(), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("model_params", sa.JSON(), nullable=False),
        sa.Column("provider_key", sa.String(64), nullable=False),
        sa.Column("endpoint_config", sa.JSON(), nullable=False),
        sa.Column("capability_snapshot", sa.JSON(), nullable=False),
        sa.Column("credential_ref", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    metadata.create_all(engine)
    migration = _load_migration_module("c3d7e9f1a204_backfill_model_config_revisions.py")

    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "INSERT INTO providers (id, name, base_url, image_base_url, video_base_url) "
                "VALUES ('aliyun', '阿里百炼', 'https://dashscope.example/v1', "
                "'https://dashscope.example/api/v1', 'https://dashscope.example/api/v1')"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO models (id, name, category, provider_id, params, current_revision_id) VALUES "
                "('legacy-image', 'wan-image', 'image', 'aliyun', '{}', NULL), "
                "('existing-video', 'wan-video', 'video', 'aliyun', '{}', NULL)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO model_config_revisions "
                "(id, model_id, version_id, model_name, category, model_params, provider_key, "
                "endpoint_config, capability_snapshot, credential_ref, created_at, updated_at) VALUES "
                "('existing-revision', 'existing-video', 3, 'wan-video', 'video', '{}', "
                "'aliyun_bailian', '{}', '{}', 'provider:aliyun', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            )
        )

        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()

        models = {
            row.id: row.current_revision_id
            for row in connection.execute(sa.text("SELECT id, current_revision_id FROM models"))
        }
        assert models["legacy-image"].startswith("backfill-")
        assert models["existing-video"] == "existing-revision"
        revision = connection.execute(
            sa.text(
                "SELECT provider_key, credential_ref, endpoint_config "
                "FROM model_config_revisions WHERE id = :id"
            ),
            {"id": models["legacy-image"]},
        ).one()
        assert revision.provider_key == "aliyun_bailian"
        assert revision.credential_ref == "provider:aliyun"
        assert "dashscope.example" in revision.endpoint_config

        migration.downgrade()
        pointers = {
            row.id: row.current_revision_id
            for row in connection.execute(sa.text("SELECT id, current_revision_id FROM models"))
        }
        assert pointers["legacy-image"] is None
        assert pointers["existing-video"] == "existing-revision"

    engine.dispose()
