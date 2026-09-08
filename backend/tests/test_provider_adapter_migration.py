"""Isolated migration round-trip preserves legacy provider data."""
import importlib.util
from pathlib import Path
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def test_provider_adapter_migration_preserves_legacy_rows():
    """Only add a nullable protocol field; never rewrite keys or old display names."""
    path = Path(__file__).parents[1] / "alembic/versions/a7b9c1d3e508_add_provider_adapter_key.py"
    spec = importlib.util.spec_from_file_location("provider_adapter_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, api_key TEXT)"))
        connection.execute(sa.text("INSERT INTO providers VALUES ('p', 'legacy', 'test-only')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert tuple(connection.execute(sa.text("SELECT id,name,api_key,adapter_key FROM providers")).one()) == ("p", "legacy", "test-only", None)
        migration.downgrade()
        assert tuple(connection.execute(sa.text("SELECT id,name,api_key FROM providers")).one()) == ("p", "legacy", "test-only")
    engine.dispose()
