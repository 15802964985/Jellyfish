"""创作设定的继承、清空、版本隔离与用途编译回归。"""
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.db import Base
from app.models.studio import Project, Chapter, Shot
from app.core.contracts.creative_direction import CreativeWrite, CreativeFields
from app.services.studio.creative_direction import read_direction, write_direction, legacy_fields, compile_direction

@pytest.mark.asyncio
async def test_direction_inheritance_versions_and_explicit_clear():
    """真实隔离数据库验证父子变化、恢复继承与历史快照不可变。"""
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine,expire_on_commit=False)() as db:
            db.add_all([Project(id='p',name='项目',style='动漫3D',visual_style='动漫'),
                Chapter(id='c',project_id='p',index=1,title='章'),Shot(id='s',chapter_id='c',index=1,title='镜头')])
            await db.commit()
            initial=await read_direction(db,'shot','s')
            assert initial.effective['treatment']=='3D动画'
            await write_direction(db,'project','p',CreativeWrite(expected_revision=0,overrides=CreativeFields(presentation='动漫',treatment='3D国漫',primary_genre='玄幻修真',era='架空时代')))
            current=await read_direction(db,'shot','s')
            assert current.effective['primary_genre']=='玄幻修真'
            assert current.sources['era']['scope']=='project'
            snapshot=current.model_dump(mode='json')
            await write_direction(db,'chapter','c',CreativeWrite(expected_revision=0,overrides=CreativeFields(era=None)))
            cleared=await read_direction(db,'shot','s')
            assert cleared.effective['era'] is None
            assert cleared.fingerprint!=current.fingerprint
            assert snapshot['effective']['era']=='架空时代'
            await write_direction(db,'chapter','c',CreativeWrite(expected_revision=1,overrides=CreativeFields()))
            assert (await read_direction(db,'shot','s')).effective['era']=='架空时代'
            with pytest.raises(HTTPException) as exc:
                await write_direction(db,'project','p',CreativeWrite(expected_revision=0))
            assert exc.value.status_code==409
            compiled=compile_direction('用户提示词',current,'frame')
            assert '单帧' in compiled and '玄幻修真' in compiled
            assert compile_direction(compiled,current,'frame')==compiled
            with pytest.raises(HTTPException): compile_direction(compiled,cleared,'frame')
    finally: await engine.dispose()

def test_legacy_no_invented_animation_origin():
    """旧3D值不能推断国漫，旧水墨也不能推断神话剧情。"""
    assert legacy_fields(SimpleNamespace(style='动漫3D',visual_style='动漫'))=={'presentation':'动漫','treatment':'3D动画'}
    assert 'primary_genre' not in legacy_fields(SimpleNamespace(style='水墨画',visual_style='动漫'))

def test_invalid_treatment_rejected():
    """表现形式与画风的矛盾不能存为看似有效配置。"""
    with pytest.raises(ValueError): CreativeFields(presentation='真人写实',treatment='3D国漫')


@pytest.mark.asyncio
async def test_backfill_is_idempotent_and_rollback_preserves_business():
    """补值不修改原文，重复执行不新增版本，回滚只移除本批设定。"""
    from sqlalchemy import select, func
    from app.models.creative_direction import CreativeDirection
    from app.services.studio.creative_migration import backfill_directions, rollback_backfill
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            original = '时代：架空时代\n题材：玄幻修真\n原始剧情保持不变'
            db.add(Project(id='migration-p', name='迁移项目', description=original, style='动漫3D', visual_style='动漫'))
            await db.commit()
            preview = await backfill_directions(db, batch_id='trial')
            assert preview['created'][0]['overrides']['primary_genre'] == '玄幻修真'
            assert await db.scalar(select(func.count()).select_from(CreativeDirection)) == 0
            await backfill_directions(db, batch_id='trial', apply=True)
            await db.commit()
            repeated = await backfill_directions(db, batch_id='second', apply=True)
            assert repeated['created'] == [] and repeated['skipped'] == 1
            assert (await db.get(Project, 'migration-p')).description == original
            assert await rollback_backfill(db, batch_id='trial') == 1
            await db.commit()
            assert (await db.get(Project, 'migration-p')).description == original
            await backfill_directions(db, batch_id='protected', apply=True)
            await write_direction(db, 'project', 'migration-p', CreativeWrite(expected_revision=1, overrides=CreativeFields(era='人工修订')))
            await db.commit()
            with pytest.raises(ValueError, match='后续修改'):
                await rollback_backfill(db, batch_id='protected')
            assert (await read_direction(db, 'project', 'migration-p')).effective['era'] == '人工修订'
    finally: await engine.dispose()


def test_additive_migration_upgrade_and_downgrade():
    """隔离迁移验证只增删设定表，旧业务表和原始数据不受影响。"""
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    source = Path(__file__).parents[1] / 'alembic/versions/e1f3a5b7c903_creative_direction.py'
    spec = importlib.util.spec_from_file_location('creative_migration_test', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = create_engine('sqlite:///:memory:')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE preserved_business (id INTEGER PRIMARY KEY, content TEXT)'))
        conn.execute(text("INSERT INTO preserved_business VALUES (1, 'original')"))
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module.upgrade()
            assert {'creative_directions','creative_direction_revisions'} <= set(inspect(conn).get_table_names())
            module.downgrade()
            assert inspect(conn).get_table_names() == ['preserved_business']
            assert conn.scalar(text('SELECT content FROM preserved_business')) == 'original'
    engine.dispose()


@pytest.mark.asyncio
async def test_owner_cleanup_removes_descendants_but_keeps_independent_assets():
    """项目删除清理章节/分镜配置，同时保留可跨项目复用的演员配置。"""
    from sqlalchemy import select
    from app.models.studio import Actor
    from app.models.creative_direction import CreativeDirection
    from app.services.studio.creative_direction import delete_owned_directions
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            project=Project(id='cleanup-p',name='项目',style='真人都市',visual_style='现实')
            db.add_all([project,Chapter(id='cleanup-c',project_id=project.id,index=1,title='章'),
                Shot(id='cleanup-s',chapter_id='cleanup-c',index=1,title='镜头'),
                Actor(id='cleanup-a',name='演员',description='',style='真人都市',visual_style='现实')])
            await db.commit()
            for scope, id in [('project',project.id),('chapter','cleanup-c'),('shot','cleanup-s'),('actor','cleanup-a')]:
                await write_direction(db,scope,id,CreativeWrite(expected_revision=0))
            await delete_owned_directions(db,project)
            remaining=list((await db.execute(select(CreativeDirection))).scalars())
            assert [(row.scope,row.entity_id) for row in remaining] == [('actor','cleanup-a')]
    finally: await engine.dispose()
