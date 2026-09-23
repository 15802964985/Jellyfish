"""Official parsing and migration tests require no credentials, provider requests or production data."""
import importlib.util
from pathlib import Path
import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.services.llm.model_governance import parse_official_prices
from app.services.generation.specifications import HAPPY_PRICE, WAN_PRICE


def test_price_parser_requires_model_region_and_explicit_units():
    """Do not use another model, international prices or incomplete price rows for mainland estimates."""
    source = "happyhorse-1.1-i2v 模型价格 华北2（北京） 价格（元） 视频生成（480P） 0.45 每秒 视频生成（720P） 0.9 每秒 视频生成（1080P） 1.2 每秒 新加坡 视频生成（480P） 999 每秒"
    assert parse_official_prices(HAPPY_PRICE, source)["rates"]["480P"] == "0.45"
    assert parse_official_prices(HAPPY_PRICE, source.replace("华北2", "华北\n2"))["rates"]["720P"] == "0.9"
    assert parse_official_prices(HAPPY_PRICE, source.replace("每秒", "每张")) is None
    assert parse_official_prices(HAPPY_PRICE, source.replace("happyhorse-1.1-i2v", "other")) is None
    assert parse_official_prices(WAN_PRICE, "wan2.7-image-pro 模型价格 华北2（北京） 价格（元） 图片生成 0.5 每张")["rates"]["standard"] == "0.5"


def test_governance_migration_preserves_shot_data():
    """Round-trip the additive migration on an isolated database; existing shot data survives."""
    path = Path(__file__).parents[1] / "alembic/versions/b8c0d2e4f609_frame_reference_selections.py"
    spec = importlib.util.spec_from_file_location("governance_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE shot_details (id TEXT PRIMARY KEY, first_frame_prompt TEXT)"))
        connection.execute(sa.text("INSERT INTO shot_details VALUES ('s', 'keep prompt')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert tuple(connection.execute(sa.text("SELECT * FROM shot_details")).one()) == ("s", "keep prompt", None)
        connection.execute(sa.text("INSERT INTO generation_calls (id,task_id,method,endpoint,request,state) VALUES ('a','t','POST','https://example.test','{}','sending')"))
        assert connection.execute(sa.text("SELECT created_at FROM generation_calls")).scalar() is not None
        migration.downgrade()
        assert tuple(connection.execute(sa.text("SELECT * FROM shot_details")).one()) == ("s", "keep prompt")
    engine.dispose()
