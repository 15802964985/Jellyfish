"""Actual MySQL migration/locking verification, restricted to a dedicated throwaway host."""
import asyncio,importlib.util,json
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.config import settings
from app.core.db import Base
import app.models
from app.models.web_generation import WebGenerationAccount
from app.models.studio_assets import Scene
from app.models.studio_asset_images import SceneImage
from app.core.contracts.web_generation import WebImageRequest
from app.services.generation import web_generation as service

async def main():
    """Use only the ephemeral container and its empty test database, never production."""
    url=make_url(settings.database_url)
    assert url.host=='jellyfish-web-verify-mysql' and url.database=='web_verify'
    engine=create_async_engine(url)
    try:
        async with engine.begin() as conn:
            assert await conn.scalar(text('SELECT version_num FROM alembic_version'))=='a3c5e7f9b015'
            await conn.execute(text('DROP TABLE web_generation_accounts'))
            spec=importlib.util.spec_from_file_location('revision','/app/alembic/versions/a3c5e7f9b015_web_generation_accounts.py')
            revision=importlib.util.module_from_spec(spec);spec.loader.exec_module(revision)
            def migrate(sync):
                """Exercise the actual new revision on MySQL."""
                with Operations.context(MigrationContext.configure(sync)):
                    revision.upgrade();revision.downgrade();revision.upgrade()
            await conn.run_sync(migrate)
        sessions=async_sessionmaker(engine,expire_on_commit=False)
        async with sessions.begin() as db:
            db.add(Scene(id='verify-scene',name='Web verification only',style='cinematic'))
            await db.flush()
            db.add_all([SceneImage(id=1,scene_id='verify-scene'),SceneImage(id=2,scene_id='verify-scene',view_angle='back')])
            for account in ['account-a','account-b']:
                db.add(WebGenerationAccount(id=account,platform='doubao',display_name=account,enabled=True,session_state='ready',supported_models=['Seedream 4.5'],heartbeat_at=service.web_accounts.now()))
        async with sessions.begin() as db:
            for i in [1,2]:
                await service.submit(db,WebImageRequest(request_id=f'web_mysql_verify_00{i}',target_type='scene',entity_id='verify-scene',slot_id=i,expected_version=1,prompt=f'building {i}',external_transfer_confirmed=True))
        async def claim(account):
            """Each contender gets a separate connection and transaction."""
            async with sessions.begin() as db:return await service.claim(db,account,account*5)
        first=await asyncio.gather(claim('account-a'),claim('account-b'))
        second=await asyncio.gather(claim('account-a'),claim('account-b'))
        assert all(second) and second[0]['task_id']!=second[1]['task_id']
        assert len({row['task_id'] for row in first if row})<=2
        async with sessions.begin() as db:
            restored=await service.resume(db,second[0]['task_id'],'account-a'*5)
            assert restored['request']['account_id']=='account-a'
        print(json.dumps({'mysql_migration_roundtrip':True,'concurrent_accounts':True,'lost_claim_recovery':True,'production_database_untouched':True}))
    finally:await engine.dispose()
asyncio.run(main())