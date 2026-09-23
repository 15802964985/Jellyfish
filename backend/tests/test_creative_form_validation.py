"""创作表单校验与叙事边界，不调用模型。"""
import pytest
from pydantic import ValidationError
from app.core.contracts.creative_direction import CreativeFields, CreativeWrite
from app.schemas.studio.projects import ProjectCreate
from app.services.studio.creative_direction import write_direction,read_direction,direction_prompt
from tests.test_project_video_export import _build_session,_seed_project

def test_duplicate_and_blank_choices_are_rejected():
    """主辅重复、空标签和重复标签不能写入。"""
    for body in [dict(primary_genre='仙侠',secondary_genres=['仙侠']),dict(narrative_tags=['成长',' 成长 ']),dict(narrative_tags=[' '])]:
        with pytest.raises(ValidationError):CreativeFields(**body)
    assert CreativeFields(era='  ').era is None
    assert CreativeFields(era=' 唐代 ').era=='唐代'

def test_new_project_requires_basics_only_when_new_configuration_supplied():
    """旧调用可省略新配置；主动填写不能漏画面或主题材。"""
    values=dict(id='p',name='项目',style='真人都市')
    assert ProjectCreate(**values).creative_direction is None
    with pytest.raises(ValidationError):ProjectCreate(**values,creative_direction={'presentation':'真人写实'})
    assert ProjectCreate(**values,creative_direction={'presentation':'真人写实','treatment':'影视写实','primary_genre':'仙侠'})

@pytest.mark.asyncio
async def test_mix_genres_and_inherited_duplicate_validation():
    """允许现代修真；生成文本消费多选项，但禁止重复继承的主题材。"""
    from fastapi import HTTPException
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            await write_direction(db,'project','project-1',CreativeWrite(expected_revision=0,overrides=CreativeFields(primary_genre='玄幻修真',secondary_genres=['都市生活'],narrative_tags=['成长','悬疑'],world_rules='修炼者隐居现代城市')))
            await db.commit()
            direction=await read_direction(db,'shot','shot-1')
            for purpose in ['asset','frame','video','script','review']:
                text=direction_prompt(direction,purpose)
                assert all(v in text for v in ['都市生活','成长','悬疑','修炼者隐居现代城市'])
            with pytest.raises(HTTPException):await write_direction(db,'shot','shot-1',CreativeWrite(expected_revision=0,overrides=CreativeFields(secondary_genres=['玄幻修真'])))
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_mixed_genres_require_explanation_before_save():
    """用户可采用混合题材，但无主线或融合依据不能保存。"""
    from fastapi import HTTPException
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            await db.commit()
            with pytest.raises(HTTPException,match='世界规则'):
                await write_direction(db,'project','project-1',CreativeWrite(expected_revision=0,overrides=CreativeFields(primary_genre='仙侠',secondary_genres=['都市生活'])))
            await db.rollback()
            result=await write_direction(db,'project','project-1',CreativeWrite(expected_revision=0,overrides=CreativeFields(primary_genre='仙侠',secondary_genres=['都市生活'],world_rules='仙人隐居现代城市，凡人不知其存在')))
            assert '混合题材以主题材为主' in direction_prompt(result,'video')
    finally:await engine.dispose()

def test_legacy_incomplete_mix_blocks_new_generation_not_history():
    """旧混合配置可读取，但不能绕过免费预览的校验发起新生成。"""
    from fastapi import HTTPException
    from app.core.contracts.creative_direction import CreativeRead
    from app.services.studio.creative_direction import compile_direction
    record=CreativeRead(scope='project',entity_id='p',revision=1,overrides={},effective={'primary_genre':'仙侠','secondary_genres':['都市生活']},sources={},fingerprint='old')
    with pytest.raises(HTTPException,match='混合题材说明'):compile_direction('原文',record,'video')
    assert record.effective['primary_genre']=='仙侠'
