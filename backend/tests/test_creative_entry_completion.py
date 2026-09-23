"""第六项缺口回归：不调用模型、不访问生产数据库。"""
import pytest
from fastapi import HTTPException
from app.models.studio import Character, FileItem, ShotCharacterLink, PromptTemplate
from app.core.contracts.character_appearances import AppearanceCreate, AppearanceSelection, AppearanceView
from app.core.contracts.creative_direction import CreativeWrite, CreativeFields, TemplateContextInput
from app.services.studio.character_appearances import create_appearance, select_appearance, list_appearances
from app.services.studio.creative_direction import read_direction, write_direction, compile_direction
from app.services.studio.character_views import character_angle_groups
from app.services.studio.project_visual_review import visual_context
from app.services.studio.project_editing import load_project_edit, save_project_edit
from app.schemas.studio.timeline import ProjectEditSave
from tests.test_project_video_export import _build_session, _seed_project

@pytest.mark.asyncio
async def test_appearance_identity_selection_isolation_and_media_protection():
    """同角色保留现代/古装；跨角色拒绝、并发冲突、旧图受保护且镜头互不串用。"""
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            db.add_all([Character(id='role',name='同一人物',project_id='project-1',style='real_people_city'),Character(id='other',name='另一人物',project_id='project-1',style='real_people_city'),FileItem(id='look-image',name='古装',type='image',storage_key='look.jpg')])
            await db.flush()
            db.add_all([ShotCharacterLink(shot_id='shot-1',character_id='role'),ShotCharacterLink(shot_id='shot-2',character_id='role')]);await db.flush()
            first=await create_appearance(db,'role',AppearanceCreate(name='现代',views=[]))
            ancient=await create_appearance(db,'role',AppearanceCreate(name='古装',description='青色长袍',creative_direction=CreativeFields(era='古代'),views=[AppearanceView(file_id='look-image')]))
            original=(await read_direction(db,'shot','shot-1')).fingerprint
            await select_appearance(db,'shot-1','role',AppearanceSelection(appearance_id=ancient.id))
            chosen=await read_direction(db,'shot','shot-1')
            assert chosen.fingerprint!=original and '青色长袍' in compile_direction('生成',chosen,'frame')
            assert not (await read_direction(db,'shot','shot-2')).appearances
            groups=await character_angle_groups(db,'shot-1')
            assert groups[0].appearance_id==ancient.id and groups[0].views[0].file_id=='look-image'
            with pytest.raises(HTTPException) as exc: await select_appearance(db,'shot-1','role',AppearanceSelection(appearance_id=first.id))
            assert exc.value.status_code==409
            foreign=await create_appearance(db,'other',AppearanceCreate(name='他人',views=[]))
            with pytest.raises(HTTPException) as exc: await select_appearance(db,'shot-1','role',AppearanceSelection(appearance_id=foreign.id,expected_appearance_id=ancient.id))
            assert exc.value.status_code==422
            from app.services.studio.file_deletion import get_file_delete_impact
            refs=await get_file_delete_impact(db,file_id='look-image')
            assert not refs.can_delete and any('角色造型' in group.label for group in refs.groups)
            await write_direction(db,'character','role',CreativeWrite(expected_revision=0,overrides=CreativeFields(era='未来')))
            assert (await list_appearances(db,'role'))[0].data['creative_direction']['era']=='古代'
            from app.services.generation.quality_sources import collect_quality_sources
            source=await collect_quality_sources(db,shot_id='shot-1',prompt='')
            role_direction=next(s for s in source.sources if s.kind=='character' and s.field=='creative_direction')
            assert '古代' in role_direction.text and '未来' not in role_direction.text
            with pytest.raises(HTTPException):
                await create_appearance(db,'role',AppearanceCreate(name='坏引用',views=[],creative_direction=CreativeFields(reference_file_ids=['not-a-file'])))
            image=await db.get(FileItem,'look-image');image.content_version+=1;await db.flush()
            assert (await read_direction(db,'shot','shot-1')).fingerprint!=chosen.fingerprint
    finally: await engine.dispose()

@pytest.mark.asyncio
async def test_previous_shot_direction_invalidates_and_freezes_own_evidence():
    """真实复现上一镜头时代变化，确保当前片段历史指纹变化。"""
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            plan=(await load_project_edit(db,'project-1')).plan
            await save_project_edit(db,'project-1',ProjectEditSave(expected_revision=0,plan=plan))
            context,before=await visual_context(db,'project-1',plan.clips[1].id)
            await write_direction(db,'shot',plan.clips[0].shot_id,CreativeWrite(expected_revision=0,overrides=CreativeFields(era='唐代',narrative_tags=['穿越'])))
            context,after=await visual_context(db,'project-1',plan.clips[1].id)
            assert before!=after
            previous=context['shot_contexts'][plan.clips[0].id]
            assert previous['creative_direction']['effective']['era']=='唐代'
            assert context['shot_contexts'][plan.clips[1].id]['creative_direction']['effective'].get('era')!='唐代'
            assert any(s['field']=='script_excerpt' for s in previous['sources']['sources'])
    finally: await engine.dispose()

@pytest.mark.asyncio
async def test_template_trial_uses_current_context_and_lists_missing():
    """模板使用真实渲染器，缺项可见；修改设定后免费再预览读取新值。"""
    from app.services.studio.template_context import preview_template_context, context_options
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            db.add(PromptTemplate(id='trial',category='character_image',name='试模板',content='{{name}} / {{era}} / {{missing}}',variables=['name','era','missing'],version=3));await db.flush()
            await write_direction(db,'project','project-1',CreativeWrite(expected_revision=0,overrides=CreativeFields(era='架空古代')))
            result=await preview_template_context(db,TemplateContextInput(template_id='trial',scope='project',entity_id='project-1'))
            assert result.template_version==3 and result.missing==['missing'] and '架空古代' in result.prompt
            assert (await context_options(db,'project','测试'))[0].value=='project-1'
            assert await context_options(db,'project','不存在')==[]
            assert (await db.get(PromptTemplate,'trial')).content=='{{name}} / {{era}} / {{missing}}'
    finally: await engine.dispose()

def test_sync_divider_passes_explicit_context(monkeypatch):
    """旧同步辅助入口不能引用异步run_args；不调用真实供应商。"""
    from app.services import script_processing_worker as worker
    captured={}
    class FakeAgent:
        """记录上下文的纯本地替身。"""
        def __init__(self,llm,creative_context):
            """保留调用参数供断言。"""
            captured['context']=creative_context
        def divide_script(self,script_text):
            """回传原文证明调用实际执行。"""
            return script_text
    monkeypatch.setattr(worker,'build_default_text_llm_sync',lambda *args,**kwargs:object())
    monkeypatch.setattr(worker,'ScriptDividerAgent',FakeAgent)
    assert worker.generate_division_result(db=None,script_text='原文',creative_context='唐代')=='原文'
    assert captured['context']=='唐代'

def test_appearance_migration_preserves_existing_tables():
    """隔离升级/回退造型表，验证现有业务行保持不变。"""
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    spec=importlib.util.spec_from_file_location('appearance_migration',Path(__file__).parents[1]/'alembic/versions/f2a4b6c8d014_character_appearances.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    engine=create_engine('sqlite:///:memory:')
    try:
        with engine.begin() as conn:
            conn.execute(text('CREATE TABLE characters (id VARCHAR(64) PRIMARY KEY)'))
            conn.execute(text('CREATE TABLE shots (id VARCHAR(64) PRIMARY KEY)'))
            conn.execute(text("INSERT INTO characters VALUES ('preserved')"))
            with Operations.context(MigrationContext.configure(conn)):
                module.upgrade()
                assert 'character_appearances' in inspect(conn).get_table_names()
                module.downgrade()
                assert set(inspect(conn).get_table_names())=={'characters','shots'}
                assert conn.scalar(text('SELECT id FROM characters'))=='preserved'
    finally: engine.dispose()
