"""离线覆盖历史复用、应用标记和具体视频版本关联，禁止付费模型调用。"""
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.db import Base
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink
from app.models.studio import Shot
from app.core.contracts.quality_review import QualityReviewRequest, ApplyReviewRevisionRequest, ReviewGenerationContext
from app.core.contracts.generation_quality import QualitySourceBundle
from app.services.generation.quality_review_workflow import review_metadata, parse_revision, list_review_history, build_review_request, apply_review_revision, validate_video_review_lineage


def test_legacy_report_and_strict_revision():
    """旧报告不丢失；无结构/空优化稿不能变成可应用方案。"""
    assert review_metadata({'snapshot': {'operation_input': {'messages': [{'role':'user','content':'待审镜头提示词：\n原稿\n本地来源快照：\n{}'}]}}})['prompt'] == '原稿'
    assert parse_revision('```json\n{"revised_prompt":"优化后","changes":["去重复"],"unresolved":[]}\n```').revised_prompt == '优化后'
    for text in ['普通报告', '{"revised_prompt":" "}']:
        with pytest.raises(ValueError): parse_revision(text)


@pytest.mark.asyncio
async def test_history_reuse_apply_and_cross_video_binding(monkeypatch):
    """真实SQLite持久化验证跨镜头拒绝、恢复标记、参数变化不能冒充已预检。"""
    import app.services.generation.quality_sources as sources
    monkeypatch.setattr(sources, 'collect_quality_sources', AsyncMock(return_value=QualitySourceBundle()))
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    context = ReviewGenerationContext(model_revision_id='video-r1', reference_mode='text_only', ratio='16:9', seconds=10)
    def task(task_id, scope='video', action='review', source=None):
        """构造带相同单镜头版本的历史任务，未携带任何凭据。"""
        metadata = {'workflow':'quality-review-v3','scope':scope,'action':action,'prompt':'原稿','source_task_id':source,'evidence':QualitySourceBundle().model_dump(), 'generation_context':context.model_dump()}
        return GenerationTask(id=task_id, task_kind='quality_preflight', mode='async_polling', status='succeeded', payload={
            'quality_review': {'scope':scope,'action':action}, 'snapshot':{'model_id':'review-model','operation_input':{'messages':[{'role':'user','content':json.dumps(metadata)}]}}},
            result={'text':'旧建议','revision':{'revised_prompt':'优化后','changes':['去重复'],'unresolved':[]} if action=='revise' else None})
    try:
        async with sessions() as db:
            db.add_all([Shot(id='s', chapter_id='c', index=1, title='镜头1'), Shot(id='other', chapter_id='c', index=2, title='镜头2')])
            db.add_all([task('review'),task('revision',action='revise',source='review'),task('frame',scope='first')])
            for state in ['failed','cancelled','pending','empty']:
                row=task(state);row.status='succeeded' if state=='empty' else state
                if state=='empty':row.result={'text':'  '}
                db.add(row)
            await db.flush()
            db.add_all([GenerationTaskLink(task_id=i,resource_type='text',relation_type='shot_detail',relation_entity_id='s') for i in ['review','revision','frame','failed','cancelled','pending','empty']])
            await db.commit()
            history = await list_review_history(db,shot_id='s',scope='video',page=1,page_size=10)
            assert history.total == 2 and history.latest_applied is None
            # 历史读取不创建任务；再次读取文本完整保留。
            assert (await list_review_history(db,shot_id='s',scope='video',page=1,page_size=1)).total == 2
            request = QualityReviewRequest(model_id='m',prompt='当前新稿',external_and_billing_confirmed=True,action='revise',source_task_id='review',generation_context=context)
            built = await build_review_request(db,shot_id='s',body=request)
            assert '旧建议' in built.operation_input.messages[1].content and '当前新稿' in built.operation_input.messages[1].content
            with pytest.raises(HTTPException): await build_review_request(db,shot_id='other',body=request)
            with pytest.raises(HTTPException): await apply_review_revision(db,shot_id='s',task_id='revision',body=ApplyReviewRevisionRequest(prompt='优化后',before_prompt='已更改',generation_context=context))
            applied = await apply_review_revision(db,shot_id='s',task_id='revision',body=ApplyReviewRevisionRequest(prompt='优化后',before_prompt='原稿',generation_context=context))
            assert applied.application.active
        async with sessions() as db:
            history = await list_review_history(db,shot_id='s',scope='video',page=1,page_size=10)
            assert history.latest_applied.task_id == 'revision'
            assert next(r for r in history.items if r.task_id=='review').optimization_status == 'applied'
            options=SimpleNamespace(model_dump=lambda: {'ratio':'16:9','seconds':10,'resolution':None,'generate_audio':None})
            request=SimpleNamespace(quality_review_task_id='review',quality_revision_task_id='revision',operation_input=options,execution_prompt='优化后')
            command=SimpleNamespace(request=request,operation=SimpleNamespace(value='video_generation'),target=SimpleNamespace(entity_id='s'))
            snapshot=SimpleNamespace(model_revision_id='video-r1',execution_prompt='优化后',media=SimpleNamespace(frames=SimpleNamespace(first=None,last=None,keys=[])))
            await validate_video_review_lineage(db,command=command,snapshot=snapshot)
            for field,value in [('model_revision_id','new-model'),('execution_prompt','其他视频提示词')]:
                old=getattr(snapshot,field);setattr(snapshot,field,value)
                with pytest.raises(HTTPException): await validate_video_review_lineage(db,command=command,snapshot=snapshot)
                setattr(snapshot,field,old)
            assert history.latest_applied.source_fingerprint == sources.quality_source_fingerprint(QualitySourceBundle())
            # Applied drafts may be adjusted without a new model call; stale browser copies lose CAS.
            edited = await apply_review_revision(db,shot_id='s',task_id='revision',body=ApplyReviewRevisionRequest(prompt='微调后',before_prompt='优化后',generation_context=context))
            assert edited.application.prompt == '微调后'
            with pytest.raises(HTTPException):
                await apply_review_revision(db,shot_id='s',task_id='revision',body=ApplyReviewRevisionRequest(prompt='旧页面覆盖',before_prompt='优化后',generation_context=context))
            snapshot.execution_prompt = '微调后'
            await validate_video_review_lineage(db,command=command,snapshot=snapshot)
            command.target.entity_id='other'
            with pytest.raises(HTTPException): await validate_video_review_lineage(db,command=command,snapshot=snapshot)
    finally: await engine.dispose()


@pytest.mark.parametrize('text', [
    '说明：\n```json\n{"optimized_prompt":"完整稿","changes":"去重复\\n保留角色"}\n```',
    '{"data":{"优化后提示词":"完整稿","修改说明":["去重复"],"待核对项":[]}}',
    '## 优化后提示词\n完整稿\n## 修改说明\n去重复\n## 待核对项\n需要核对参考图',
])
def test_vendor_output_formats_are_normalized_offline(text):
    """不同文本模型常见输出格式归一化，不依赖模型名或自动付费修复。"""
    assert parse_revision(text).revised_prompt == '完整稿'


def test_ambiguous_revision_is_not_applied():
    """两个候选不能由格式适配器擅自选一个覆盖用户内容。"""
    with pytest.raises(ValueError): parse_revision('{"revised_prompt":"A"} {"revised_prompt":"B"}')


@pytest.mark.asyncio
async def test_frame_scope_stage_history_and_explicit_cross_scope_reference(monkeypatch):
    """成功历史严格隔离阶段/帧；legacy只可明确引用，不能冒充本帧来源。"""
    import app.services.generation.quality_sources as sources
    monkeypatch.setattr(sources, 'collect_quality_sources', AsyncMock(return_value=QualitySourceBundle()))
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine,expire_on_commit=False)() as db:
            db.add(Shot(id='s',chapter_id='c',index=1,title='镜头'))
            for scope, stage, fid in [('video','before',None),('first','before',None),('key','after','image-a'),('key','after','image-b'),('legacy','before',None)]:
                task_id=f'{scope}-{fid or stage}'
                meta={'workflow':'quality-review-v3','scope':scope,'action':'review','prompt':'旧提示词'}
                db.add(GenerationTask(id=task_id,task_kind='quality_preflight',mode='async_polling',status='succeeded',
                    payload={'quality_review':{'scope':scope,'stage':stage,'output_file_id':fid},'snapshot':{'operation_input':{'messages':[{'role':'user','content':json.dumps(meta)}]}}},result={'text':'只可作线索'}))
                await db.flush()
                db.add(GenerationTaskLink(task_id=task_id,resource_type='text',relation_type='shot_detail',relation_entity_id='s'))
            await db.commit()
            assert (await list_review_history(db,shot_id='s',scope='first',page=1,page_size=10)).total==1
            assert (await list_review_history(db,shot_id='s',scope='last',page=1,page_size=10)).total==0
            assert (await list_review_history(db,shot_id='s',scope='legacy',page=1,page_size=10)).total==1
            records=await list_review_history(db,shot_id='s',scope='key',stage='after',output_file_id='image-a',page=1,page_size=10)
            assert [r.task_id for r in records.items]==['key-image-a']
            with pytest.raises(HTTPException):
                await build_review_request(db,shot_id='s',body=QualityReviewRequest(model_id='m',scope='first',prompt='当前',action='revise',source_task_id='legacy-before',external_and_billing_confirmed=True))
            request=await build_review_request(db,shot_id='s',body=QualityReviewRequest(model_id='m',scope='first',prompt='当前',action='review_and_revise',reference_report_task_id='video-before',external_and_billing_confirmed=True))
            payload=json.loads(request.operation_input.messages[1].content)
            assert payload['scope']=='first' and payload['reference_report']['scope']=='video'
            assert '起始姿态' in request.operation_input.messages[0].content
            assert 'revised_prompt' in request.operation_input.messages[0].content
    finally: await engine.dispose()


@pytest.mark.asyncio
async def test_frame_output_ownership_apply_restore_and_exact_generation(monkeypatch):
    """具体图片归属、已应用稿的精确生成绑定、改变规格拒绝及免费恢复。"""
    import app.services.generation.quality_sources as sources
    from app.services.generation.quality_review_workflow import validate_review_output, restore_review_revision, validate_frame_review_lineage
    from app.models.studio import ShotFrameImage
    from app.core.contracts.generation import GenerationTarget, ImageGenerationOperationInput
    from app.core.contracts.media import ImageMediaInput
    monkeypatch.setattr(sources,'collect_quality_sources',AsyncMock(return_value=QualitySourceBundle()))
    engine=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine,expire_on_commit=False)() as db:
            context=ReviewGenerationContext(model_revision_id='img-r1',reference_mode='first',ratio='1:1',resolution='preview',draft_prompt='原稿')
            meta={'workflow':'quality-review-v3','scope':'first','action':'review_and_revise','prompt':'原稿','generation_context':context.model_dump(),'evidence':QualitySourceBundle().model_dump()}
            row=GenerationTask(id='combined',task_kind='quality_preflight',mode='async_polling',status='succeeded',payload={'quality_review':{'scope':'first'},'snapshot':{'operation_input':{'messages':[{'role':'user','content':json.dumps(meta)}]}}},result={'text':'方案','revision':{'revised_prompt':'优化稿','changes':['说明'],'unresolved':[]}})
            db.add_all([Shot(id='s',chapter_id='c',index=1,title='镜头'),ShotFrameImage(id=9,shot_detail_id='s',frame_type='first',file_id='output-a'),row])
            await db.flush()
            db.add(GenerationTaskLink(task_id='combined',resource_type='text',relation_type='shot_detail',relation_entity_id='s'))
            await db.commit()
            await validate_review_output(db,shot_id='s',scope='first',file_id='output-a')
            for shot,scope in [('other','first'),('s','last')]:
                with pytest.raises(HTTPException): await validate_review_output(db,shot_id=shot,scope=scope,file_id='output-a')
            await apply_review_revision(db,shot_id='s',task_id='combined',body=ApplyReviewRevisionRequest(prompt='优化稿',before_prompt='原稿',generation_context=context))
            command=SimpleNamespace(target=GenerationTarget(kind='shot_frame_slot',entity_id='s',slot_id='9'),request=SimpleNamespace(quality_review_task_id='combined',quality_revision_task_id='combined'))
            snapshot=SimpleNamespace(execution_prompt='优化稿',model_revision_id='img-r1',media=ImageMediaInput(references=[]),operation_input=ImageGenerationOperationInput(target_ratio='1:1',resolution_profile='preview'))
            await validate_frame_review_lineage(db,command=command,snapshot=snapshot)
            snapshot.operation_input.resolution_profile='high'
            with pytest.raises(HTTPException): await validate_frame_review_lineage(db,command=command,snapshot=snapshot)
            snapshot.operation_input.resolution_profile='preview'
            await restore_review_revision(db,shot_id='s',task_id='combined')
            with pytest.raises(HTTPException): await validate_frame_review_lineage(db,command=command,snapshot=snapshot)
    finally: await engine.dispose()


def test_after_review_requires_actual_output_image():
    """不能只提交输出ID却不送图，然后声称检查了图像像素。"""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        QualityReviewRequest(model_id='m',scope='first',prompt='检查',external_and_billing_confirmed=True,
            generation_context=ReviewGenerationContext(stage='after',output_file_id='output'))


@pytest.mark.asyncio
async def test_initial_frame_prompt_uses_local_evidence_without_saving(monkeypatch):
    """逐帧草稿来源可追溯；不混入邻镜动作，不覆盖持久提示词、不调用模型。"""
    from app.models.studio import ShotFrameType
    from app.core.contracts.generation_quality import QualitySourceSnapshot
    from app.services.generation.prompts import frame_guidance as service
    import app.services.generation.quality_sources as sources
    bundle = QualitySourceBundle(sources=[QualitySourceSnapshot(kind="shot", entity_id="s", field="script_excerpt", text="走近窗边", content_sha256="x"), QualitySourceSnapshot(kind="neighbour", entity_id="n", field="next", text="下一镜头离开", content_sha256="y")])
    monkeypatch.setattr(sources, "collect_quality_sources", AsyncMock(return_value=bundle))
    monkeypatch.setattr(service, "load_frame_render_guidance", AsyncMock(side_effect=lambda **kw: {"frame_specific_guidance": kw["frame_type"].value + "阶段"}))
    db = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(title="窗边", script_excerpt="走近窗边")))
    for scope in (ShotFrameType.first, ShotFrameType.key, ShotFrameType.last):
        result = await service.build_initial_frame_prompt(db=db, shot_id="s", frame_type=scope)
        assert "走近窗边" in result["prompt"] and scope.value + "阶段" in result["prompt"]
        assert "下一镜头离开" not in result["prompt"]
        assert result["warnings"] == [] and "免费" in result["notice"]


@pytest.mark.asyncio
async def test_review_model_directory_uses_actual_provider_states():
    """目录沿用执行层active/testing可选、disabled禁用，避免把全部检查模型筛空。"""
    from app.models.llm import Provider, Model
    from app.services.generation.quality_review_workflow import review_model_choices
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessions() as db:
            for status in ['active','testing','disabled']:
                db.add(Provider(id=status,name='阿里百炼',adapter_key=None,base_url='https://example.invalid',status=status))
                db.add(Model(id=status,name='qwen3.8-max',category='text',provider_id=status))
            await db.commit()
            rows = await review_model_choices(db)
            assert {r['id'] for r in rows} == {'active','testing'}
            assert all(r['supports_images'] for r in rows)
    finally: await engine.dispose()


@pytest.mark.asyncio
async def test_active_reviews_restore_separately_from_successful_history():
    """运行任务可恢复，失败不复用，其他镜头/帧/阶段不串入当前范围。"""
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            db.add(Shot(id='s', chapter_id='c', index=1, title='镜头'))
            for task_id, status, scope, stage, shot in [('active','running','first','before','s'),('ok','succeeded','first','before','s'),('bad','failed','first','before','s'),('other-frame','running','last','before','s'),('after','running','first','after','s'),('other-shot','running','first','before','other')]:
                meta={'workflow':'quality-review-v3','scope':scope,'action':'review','prompt':'当前稿'}
                db.add(GenerationTask(id=task_id, task_kind='quality_preflight', mode='async_polling', status=status, payload={'quality_review':{'scope':scope,'stage':stage},'snapshot':{'operation_input':{'messages':[{'role':'user','content':json.dumps(meta)}]}}}, result={'text':'结果'} if status=='succeeded' else None))
                await db.flush()
                db.add(GenerationTaskLink(task_id=task_id, resource_type='text', relation_type='shot_detail', relation_entity_id=shot))
            await db.commit()
            result=await list_review_history(db, shot_id='s', scope='first', stage='before', page=1, page_size=10)
            assert [r.task_id for r in result.active_tasks]==['active']
            assert [r.task_id for r in result.items]==['ok'] and result.total==1
    finally: await engine.dispose()
