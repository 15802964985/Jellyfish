"""Offline reference contract regression; no supplier requests or production database writes."""
import pytest
from app.core.contracts.media import MediaReference, VideoSubjectMediaReference
from app.core.contracts.video_generation import VideoGenerationInput, VideoSubjectReference
from app.core.integrations.video_capabilities import validate_video_options
from app.services.generation.prompts.renderers import compile_video_preview_profile
from app.core.contracts.quality_review import ReviewGenerationContext


def subject(name, count=1, kind='image'):
    """Build deterministic file references to exercise ordering and global limits."""
    return VideoSubjectReference(name=name, media=[MediaReference(file_id=f'{name}{i}',media_kind=kind,ordinal=i) for i in range(count)])


def test_happyhorse_global_limit_and_image_only():
    """Nine images across groups work; the tenth, video/audio, mixed frames and wrong duration fail."""
    common = dict(prompt='主体按镜头动作表演',ratio='16:9',seconds=5,resolution='480P')
    check = lambda value: validate_video_options(provider='aliyun_bailian',model='happyhorse-1.1-r2v',input_=value)
    check(VideoGenerationInput(**common,subject_references=[subject('妈妈',5),subject('场景',4)]))
    for refs in [[subject('妈妈',5),subject('场景',5)], [subject('妈妈',kind='video')], [subject('妈妈',kind='audio')], []]:
        with pytest.raises(ValueError): check(VideoGenerationInput(**common,subject_references=refs))
    with pytest.raises(ValueError): check(VideoGenerationInput(**{**common,'seconds':16},subject_references=[subject('妈妈')]))
    with pytest.raises(ValueError): check(VideoGenerationInput(**common,subject_references=[subject('妈妈')],frame_references={'first_frame':{'file_id':'frame','media_kind':'image'}}))


def test_subject_mapping_preview_matches_send_and_reorders():
    """Native Image aliases follow real media order, including replacing a previously compiled mapping."""
    refs = [VideoSubjectMediaReference.model_validate(subject(name).model_dump()) for name in ['角色·妈妈','场景·林荫道']]
    args = dict(provider_key='aliyun_bailian',model_name='happyhorse-1.1-r2v',reference_mode='subjects',images=[],subjects=refs)
    text = compile_video_preview_profile('妈妈走进林荫道',**args)
    assert '[Image 1]=角色·妈妈；[Image 2]=场景·林荫道' in text
    assert compile_video_preview_profile(text,**args) == text
    changed = compile_video_preview_profile(text,**{**args,'subjects':list(reversed(refs))})
    assert '[Image 1]=场景·林荫道；[Image 2]=角色·妈妈' in changed
    assert changed.count('主体图片映射：') == 1
    old = ReviewGenerationContext(reference_mode='subjects',subjects=refs)
    new = ReviewGenerationContext(reference_mode='subjects',subjects=list(reversed(refs)))
    assert old.model_dump() != new.model_dump()


@pytest.mark.asyncio
async def test_adoption_rejects_cross_shot_and_stale_current(monkeypatch):
    """Real isolated SQLite ownership/CAS validation, independent of storage or billed tasks."""
    from unittest.mock import AsyncMock
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.db import Base
    from app.models.studio import Shot, FileItem
    from app.models.task import GenerationTask
    from app.models.task_links import GenerationTaskLink
    import app.services.studio.shot_video_adoption as service
    monkeypatch.setattr(service, 'sync_usage_from_shot_context', AsyncMock())
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as connection: await connection.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine,expire_on_commit=False)() as db:
            db.add_all([Shot(id='s',chapter_id='c',index=1,title='shot',generated_video_file_id='old'),
                Shot(id='other',chapter_id='c',index=2,title='other'),
                FileItem(id='new',name='new',type='video',storage_key='new.mp4'),
                GenerationTask(id='t',mode='async',task_kind='video',status='succeeded',payload={},result={})])
            await db.flush()
            db.add(GenerationTaskLink(task_id='t',resource_type='video',relation_type='shot_video',relation_entity_id='s',file_id='new'))
            await db.flush()
            with pytest.raises(HTTPException): await service.adopt_shot_video(db,shot_id='other',file_id='new',expected_current_file_id=None)
            with pytest.raises(HTTPException): await service.adopt_shot_video(db,shot_id='s',file_id='new',expected_current_file_id='stale')
            assert await service.adopt_shot_video(db,shot_id='s',file_id='new',expected_current_file_id='old') == 'new'
            assert (await db.get(Shot,'s')).generated_video_file_id == 'new'
    finally: await engine.dispose()
