"""Quality review uses explicit inputs, immutable revisions, and no network in tests."""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.db import Base
from app.core.contracts.media import ImageMediaInput, MediaReference
from app.models.llm import Provider, Model, ModelConfigRevision
from app.models.task import GenerationTask
from app.services.generation.quality_vision import attach_review_images, supports_quality_vision


@pytest.mark.asyncio
async def test_vision_media_is_resolved_only_at_execution(monkeypatch):
    """Actual chat content preserves numbering; credentials and bytes stay out of snapshots."""
    import app.services.generation.quality_vision as vision
    monkeypatch.setattr(vision.FileResolver, 'resolve_task_reference', AsyncMock(return_value=SimpleNamespace(content_type='image/png', content=b'pixels')))
    media = ImageMediaInput(references=[MediaReference(file_id='img', media_kind='image', ordinal=0)])
    before = media.model_dump_json()
    messages = await attach_review_images(None, task_id='t', media=media, messages=[])
    assert messages[0].content[-1]['image_url']['url'].startswith('data:image/png;base64,')
    assert before == media.model_dump_json() and 'data:' not in before
    assert supports_quality_vision('aliyun_bailian', 'qwen3.8-max')
    assert not supports_quality_vision('aliyun_bailian', 'unknown-future-model')
    assert not supports_quality_vision('anthropic', 'qwen3.8-max')


@pytest.mark.asyncio
@pytest.mark.parametrize('with_images', [False, True])
@pytest.mark.parametrize('transport_failure', [False, True])
@pytest.mark.parametrize('cancel', [False, True])
@pytest.mark.parametrize('combined', [False, True])
async def test_quality_review_single_call_or_cancel_before_billing(monkeypatch, cancel, combined, with_images, transport_failure):
    """Real task persistence with one mocked model call and frozen endpoint options."""
    import app.services.generation.quality_review as worker
    import app.services.llm.runtime as runtime
    from app.bootstrap import bootstrap_all_registries
    bootstrap_all_registries()
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    model = SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content=[{'type':'text', 'text':json.dumps({'revised_prompt':'完整单帧优化稿','changes':['中风险：比例需核对'],'unresolved':[]},ensure_ascii=False) if combined else '中风险：请核对道具相对比例。'}])))
    if transport_failure:
        import httpx
        from openai import APIConnectionError
        failure = APIConnectionError(request=httpx.Request('POST', 'https://example.invalid'))
        failure.__cause__ = httpx.ReadError('sensitive transport message')
        model.ainvoke.side_effect = failure
    if with_images:
        import app.services.generation.quality_vision as vision
        monkeypatch.setattr(vision.FileResolver, 'resolve_task_reference', AsyncMock(return_value=SimpleNamespace(content_type='image/png', content=b'pixels')))
    factory_calls = []
    def factory(**kwargs):
        """Validate frozen configuration and forced no-retry policy."""
        factory_calls.append(kwargs)
        assert kwargs['model_name'] == 'qwen3.8-max'
        assert kwargs['model_params']['max_retries'] == 0
        return model
    monkeypatch.setattr(worker, 'async_session_maker', sessions)
    monkeypatch.setattr(worker, 'edit_cancel_requested', AsyncMock(return_value=cancel))
    monkeypatch.setattr(runtime, '_build_text_llm_config', factory)
    try:
        async with sessions() as db:
            db.add(Provider(id='p', name='aliyun_bailian', base_url='https://example.invalid', api_key='secret', status='enabled'))
            db.add(ModelConfigRevision(id='r', model_id='m', version_id=1, model_name='qwen3.8-max', category='text', provider_key='aliyun_bailian', credential_ref='provider:p', model_params={'max_retries': 8}))
            db.add(GenerationTask(id='review', task_kind='quality_preflight', mode='async_polling', status='pending', payload={'snapshot': {'model_revision_id': 'r', 'operation_input': {'messages': [{'role': 'user', 'content': json.dumps({'workflow':'quality-review-v3','action':'review_and_revise','scope':'first'}) if combined else '检查道具', 'sequence': 1}]}}}))
            if with_images:
                row = await db.get(GenerationTask, 'review')
                row.payload = {'snapshot': {**row.payload['snapshot'], 'media': ImageMediaInput(references=[MediaReference(file_id='img', media_kind='image', ordinal=0)]).model_dump(mode='json')}}
            await db.commit()
        await worker.run_quality_review_task('review', {})
        await worker.run_quality_review_task('review', {})
        async with sessions() as db:
            row = await db.get(GenerationTask, 'review')
            assert row.status == ('cancelled' if cancel else 'failed' if transport_failure else 'succeeded'), row.error
            if not cancel and transport_failure:
                assert 'APIConnectionError → ReadError' in row.error
                assert 'sensitive transport message' not in row.error
                assert f'实际参考图 {1 if with_images else 0} 张' in row.error
            if not cancel and not transport_failure:
                assert row.result['review_mode'] == ('image_and_text' if with_images else 'text_only')
                assert row.result['visual_verified'] is False
                assert '中风险' in row.result['text']
                if combined: assert row.result['revision']['revised_prompt']=='完整单帧优化稿'
        assert model.ainvoke.await_count == (0 if cancel else 1)
        if with_images and not cancel:
            assert model.ainvoke.call_args.args[0][-1].content[-1]['image_url']['url'].startswith('data:image/png;base64,')
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_edit_model_revision_saves_but_cannot_be_ordinary_default():
    """Adding a video category must not falsely advertise normal generation capability."""
    from app.bootstrap import bootstrap_all_registries
    from app.services.llm.manage import _create_model_revision, update_model_settings
    from app.schemas.llm import ModelSettingsUpdate
    from fastapi import HTTPException
    bootstrap_all_registries()
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            provider = Provider(id='p', name='runway', adapter_key='runway', base_url='https://api.dev.runwayml.com')
            model = Model(id='m', provider_id='p', name='aleph2', category='video')
            db.add_all([provider, model]); await db.flush()
            revision = await _create_model_revision(db, model=model, provider=provider)
            assert revision.capability_snapshot['operations'] == ['video_edit']
            with pytest.raises(HTTPException) as error:
                await update_model_settings(db, body=ModelSettingsUpdate(default_video_model_id='m'))
            assert error.value.status_code == 400
    finally:
        await engine.dispose()
