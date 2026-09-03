"""Tests for classifying databases before Alembic migration."""

import pytest

from app.scripts.migrate_database import INITIAL_SCHEMA_TABLES, _classify_database_tables


def test_versioned_database_is_detected() -> None:
    """An Alembic-owned database is versioned regardless of its current tables."""
    assert _classify_database_tables({"alembic_version"}, set()) == "versioned"


def test_empty_database_ignores_unrelated_tables() -> None:
    """A database without Jellyfish application tables can start from revision one."""
    assert _classify_database_tables({"unrelated"}, set(INITIAL_SCHEMA_TABLES)) == "empty"


def test_legacy_database_may_lack_tables_from_later_revisions() -> None:
    """A complete baseline is legacy even before later application tables exist."""
    application_tables = set(INITIAL_SCHEMA_TABLES) | {"experiment_sessions", "generation_attempts"}
    assert _classify_database_tables(set(INITIAL_SCHEMA_TABLES), application_tables) == "legacy"


def test_partial_baseline_is_rejected() -> None:
    """Missing an initial table must not be hidden by stamping the database."""
    partial_tables = set(INITIAL_SCHEMA_TABLES) - {"projects"}
    with pytest.raises(RuntimeError, match="projects"):
        _classify_database_tables(partial_tables, set(INITIAL_SCHEMA_TABLES))
