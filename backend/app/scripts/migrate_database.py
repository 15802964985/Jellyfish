"""Apply Alembic migrations and safely register databases created by the legacy initializer."""

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

import app.models  # noqa: F401  # Register every ORM table before inspecting metadata.
from app.config import settings
from app.core.db import Base


BACKEND_ROOT = Path(__file__).resolve().parents[2]
INITIAL_SCHEMA_REVISION = "05e1c5a7a117"
INITIAL_SCHEMA_TABLES = frozenset(
    {
        "files",
        "generation_tasks",
        "projects",
        "prompt_templates",
        "providers",
        "timeline_clips",
        "actors",
        "chapters",
        "costumes",
        "generation_task_links",
        "models",
        "props",
        "scenes",
        "actor_images",
        "characters",
        "costume_images",
        "model_settings",
        "prop_images",
        "scene_images",
        "shots",
        "character_images",
        "character_prop_links",
        "file_usages",
        "project_actor_links",
        "project_costume_links",
        "project_prop_links",
        "project_scene_links",
        "shot_character_links",
        "shot_details",
        "shot_extracted_candidates",
        "shot_dialog_lines",
        "shot_frame_images",
        "shot_extracted_dialogue_candidates",
    }
)


def _classify_database_tables(table_names: set[str], application_tables: set[str]) -> str:
    """Classify table names without mistaking later migrations for baseline tables."""
    if "alembic_version" in table_names:
        return "versioned"

    existing_application_tables = table_names & application_tables
    if not existing_application_tables:
        return "empty"

    missing_baseline_tables = INITIAL_SCHEMA_TABLES - table_names
    if missing_baseline_tables:
        missing = ", ".join(sorted(missing_baseline_tables))
        raise RuntimeError(
            "Database has a partial Jellyfish baseline schema and cannot be safely baselined. "
            f"Missing tables: {missing}"
        )
    return "legacy"


async def _database_state() -> str:
    """Classify the configured database before selecting an Alembic operation.

    Returns:
        ``empty`` for a database without application tables, ``versioned`` when
        Alembic already owns the schema, and ``legacy`` when all tables from the
        initial Alembic revision exist but no version table is present. Tables
        introduced by later migrations may legitimately be absent.

    Raises:
        RuntimeError: If the database contains only part of the application
            schema. Stamping such a database would hide a broken migration.
    """
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as connection:
            table_names = set(await connection.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names()))
    finally:
        await engine.dispose()

    return _classify_database_tables(table_names, set(Base.metadata.tables))


def _alembic_config() -> Config:
    """Create the backend-local Alembic configuration for command execution."""
    return Config(str(BACKEND_ROOT / "alembic.ini"))


def migrate_database() -> None:
    """Upgrade a new/versioned database or register a verified legacy schema.

    Legacy Compose databases have already received the final ORM structure and
    historical SQL changes. They are stamped only at the initial revision so
    that every future Alembic revision still executes normally.
    """
    state = asyncio.run(_database_state())
    config = _alembic_config()
    if state == "legacy":
        command.stamp(config, INITIAL_SCHEMA_REVISION)
        # Stamp only the structural baseline, then execute every data or
        # schema revision introduced after it.
        command.upgrade(config, "head")
        print(f"Stamped verified legacy schema at {INITIAL_SCHEMA_REVISION} and upgraded to head.")
        return
    command.upgrade(config, "head")
    print(f"Upgraded {state} database to Alembic head.")


if __name__ == "__main__":
    migrate_database()
