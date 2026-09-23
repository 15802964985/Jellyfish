"""Offline checks for regional editing and the immutable historical additive migration."""
from io import BytesIO
import importlib.util
from pathlib import Path
import pytest
from PIL import Image
from sqlalchemy import create_engine, inspect
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.contracts.generation import ImageEditRegion
from app.services.generation.image_region import composite_region, annotate_source


def png(color, size=(100,100)):
    """Build synthetic pixels without a network or generated user image."""
    out=BytesIO();Image.new("RGB",size,color).save(out,format="PNG");return out.getvalue()


def test_region_preserves_outside_and_rejects_changed_geometry():
    """The locally composited result keeps source pixels outside the selected rectangle."""
    region=ImageEditRegion(x=.2,y=.2,width=.4,height=.4)
    original=png("blue"); generated=png("green")
    result=Image.open(BytesIO(composite_region(original,generated,region)))
    assert result.getpixel((10,10)) == (0,0,255)
    assert result.getpixel((30,30)) == (0,128,0)
    assert result.getpixel((70,70)) == (0,0,255)
    assert original == png("blue")
    assert Image.open(BytesIO(annotate_source(original,region))).getpixel((20,20)) == (255,0,0)
    with pytest.raises(ValueError,match="比例"):
        composite_region(original,png("green",(100,50)),region)


def test_additive_recovery_quota_migration_roundtrip():
    """Upgrade and downgrade only new tables, retaining unrelated business data."""
    path=Path(__file__).parents[1]/"alembic/versions/d0e2f4a6b802_generation_recovery.py"
    spec=importlib.util.spec_from_file_location("recovery_migration",path)
    migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine=create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE retained_business (id INTEGER)")
        connection.exec_driver_sql("INSERT INTO retained_business VALUES (7)")
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert {"generation_recovery","account_quota_records"}.issubset(inspect(connection).get_table_names())
            migration.downgrade()
        assert connection.exec_driver_sql("SELECT id FROM retained_business").scalar_one() == 7
    engine.dispose()
