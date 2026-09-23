"""本地证据、付费边界和跨工程隔离测试；供应商调用全部替身。"""
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from sqlalchemy import select
from app.models.studio import FileItem
from app.models.task import GenerationTask
from app.schemas.studio.timeline import ProjectEditSave, EditVisualPrepare, EditVisualSubmit, EditVisualModel
from app.services.studio.project_editing import load_project_edit, save_project_edit, edit_duration
from app.services.studio import project_visual_review as service
from app.services.generation.quality_review_workflow import review_metadata, list_review_history
from tests.test_project_video_export import _build_session, _seed_project


@pytest.mark.asyncio
async def test_transition_validation_and_duration():
    """转场扣除重叠时长，并拒绝最后镜头转场及音画越界。"""
    db, engine = await _build_session()
    async with db:
        await _seed_project(db)
        plan = (await load_project_edit(db, 'project-1')).plan
        plan.subtitles = []
        original = edit_duration(plan)
        plan.clips[0].transition = 'fade'
        assert edit_duration(plan) == original - .4
        plan.clips[-1].transition = 'fade'
        with pytest.raises(ValueError, match='最后片段'):
            await save_project_edit(db, 'project-1', ProjectEditSave(expected_revision=0, plan=plan))
        plan.clips[-1].transition = 'cut'
        plan.clips[0].transition_seconds = 10
        with pytest.raises(ValueError, match='重叠'):
            await save_project_edit(db, 'project-1', ProjectEditSave(expected_revision=0, plan=plan))
    await engine.dispose()


@pytest.mark.asyncio
async def test_evidence_reuse_submit_identity_history_and_stale_rejection(monkeypatch):
    """同版准备不重复抽帧；成功正文才入历史，修改后旧证据不能再次收费提交。"""
    db, engine = await _build_session()
    objects = {}
    extractions = []
    commands = []
    async def upload(**kwargs):
        """本地字典模拟对象存储，测试不会写真实素材库。"""
        objects[kwargs['key']] = kwargs['data']
    async def download(*, key):
        """返回已冻结证据或测试视频字节。"""
        return objects.get(key, b'video fixture')
    async def extract(command, **kwargs):
        """模拟抽帧文件，真实 FFmpeg 另用无网络编码测试验证。"""
        extractions.append(command)
        Path(command[-1]).write_bytes(b'jpeg fixture')
    async def models(_):
        """只暴露一个明确可选的测试模型修订。"""
        return [EditVisualModel(id='m', revision_id='r', name='fixture vision')]
    async def submit(self, session, command):
        """记录实际传给统一任务系统的命令，不调用模型。"""
        commands.append(command)
        payload = {'snapshot': {'operation_input': command.request.operation_input.model_dump()}}
        payload['quality_review'] = {'scope': review_metadata(payload)['scope']}
        session.add(GenerationTask(id='review-test', task_kind='quality_preflight', mode='async_polling', status='pending', payload=payload))
        await session.flush()
        return SimpleNamespace(task_id='review-test')
    monkeypatch.setattr(service.storage, 'upload_file', upload)
    monkeypatch.setattr(service.storage, 'download_file', download)
    monkeypatch.setattr(service.shutil, 'which', lambda _: 'ffmpeg')
    monkeypatch.setattr(service, '_run_process', extract)
    monkeypatch.setattr(service, 'visual_models', models)
    from app.services.generation.submission import GenerationSubmitter
    monkeypatch.setattr(GenerationSubmitter, 'submit_async', submit)
    async with db:
        await _seed_project(db)
        for file in (await db.execute(select(FileItem))).scalars(): file.size_bytes = 100
        plan = (await load_project_edit(db, 'project-1')).plan
        saved = await save_project_edit(db, 'project-1', ProjectEditSave(expected_revision=0, plan=plan))
        await db.commit()
        body = EditVisualPrepare(expected_revision=1, clip_id=plan.clips[1].id)
        evidence = await service.prepare_visual_evidence(db, 'project-1', body)
        await db.commit()
        again = await service.prepare_visual_evidence(db, 'project-1', body)
        assert evidence == again and len(extractions) == 3 and not commands
        assert evidence.images[2].source_file_id == plan.clips[0].file_id
        assert evidence.images[2].shot_id == plan.clips[0].shot_id
        assert evidence.images[2].clip_id == plan.clips[0].id
        assert evidence.shot_contexts[plan.clips[0].id]['shot_id'] == plan.clips[0].shot_id
        request = EditVisualSubmit(evidence_id=evidence.evidence_id, model_id='m', model_revision_id='r', request_id='request-1', external_and_billing_confirmed=True)
        with pytest.raises(ValueError, match='本项目'):
            await service.submit_visual_review(db, 'wrong-project', request)
        task_id = await service.submit_visual_review(db, 'project-1', request)
        assert commands[0].target.entity_id == plan.clips[1].shot_id
        assert json.loads(commands[0].request.operation_input.messages[1].content)['shot_contexts'] == evidence.shot_contexts
        assert commands[0].request.expected_model_revision_id == 'r'
        assert [r.file_id for r in commands[0].request.media.references] == [i.file_id for i in evidence.images]
        task = await db.get(GenerationTask, task_id)
        assert task.payload['quality_review']['scope'] == 'editor_visual'
        task.status = 'failed'; task.result = {'text': 'partial'}
        await db.commit()
        assert await service.visual_history(db, 'project-1', body.clip_id) == []
        task.status = 'succeeded'; task.result = {'text': '  '}
        await db.commit()
        assert await service.visual_history(db, 'project-1', body.clip_id) == []
        task.result = {'text': '模型原始报告：待人工核对'}
        await db.commit()
        history = await service.visual_history(db, 'project-1', body.clip_id)
        assert len(history) == 1 and history[0].matches_current
        assert history[0].created_at.endswith('+00:00')
        assert await service.visual_history(db, 'project-1', plan.clips[0].id) == []
        saved.plan.clips[0].in_seconds = .1
        await save_project_edit(db, 'project-1', ProjectEditSave(expected_revision=1, plan=saved.plan))
        await db.commit()
        assert not (await service.visual_history(db, 'project-1', body.clip_id))[0].matches_current
        with pytest.raises(ValueError, match='已变化'):
            await service.submit_visual_review(db, 'project-1', request)
        assert len(commands) == 1
    await engine.dispose()

@pytest.mark.asyncio
async def test_character_angles_and_explicit_evidence_selection(monkeypatch):
    """角度限定在本镜头，选择/顺序/容量进入缓存与实际证据，换图后旧检查失效。"""
    from app.models.studio import Actor, Character, CharacterImage, ActorImage, ShotCharacterLink
    from app.services.studio.character_views import character_angle_groups
    db, engine = await _build_session()
    objects = {}
    async def upload(**kwargs):
        """隔离对象写入。"""
        objects[kwargs['key']] = kwargs['data']
    async def download(*, key):
        """隔离对象读取。"""
        return objects.get(key, b'fixture video')
    async def extract(command, **kwargs):
        """模拟本地抽帧，不运行模型。"""
        Path(command[-1]).write_bytes(b'jpeg')
    monkeypatch.setattr(service.storage, 'upload_file', upload)
    monkeypatch.setattr(service.storage, 'download_file', download)
    monkeypatch.setattr(service.shutil, 'which', lambda _: 'ffmpeg')
    monkeypatch.setattr(service, '_run_process', extract)
    async with db:
        await _seed_project(db)
        db.add(Actor(id='actor', name='演员', style='real_people_city'))
        db.add_all([Character(id='role', name='角色', project_id='project-1', actor_id='actor', style='real_people_city'),
                    Character(id='other', name='未关联角色', project_id='project-1', style='real_people_city')])
        await db.flush()
        db.add(ShotCharacterLink(shot_id='shot-2', character_id='role'))
        for fid in ['front', 'side', 'back', 'actor-front', 'other-front']:
            db.add(FileItem(id=fid, type='image', name=fid, storage_key=f'images/{fid}', checksum=fid))
        await db.flush()
        for fid, angle in [('front','FRONT'), ('side','LEFT'), ('back','BACK')]:
            db.add(CharacterImage(character_id='role', file_id=fid, view_angle=angle))
        db.add(CharacterImage(character_id='role', file_id=None, view_angle='RIGHT'))
        db.add(CharacterImage(character_id='other', file_id='other-front', view_angle='FRONT'))
        db.add(ActorImage(actor_id='actor', file_id='actor-front', view_angle='FRONT'))
        for file in (await db.execute(select(FileItem))).scalars(): file.size_bytes = 100
        await db.commit()
        groups = await character_angle_groups(db, 'shot-2')
        assert len(groups) == 1 and groups[0].actor_name == '演员'
        assert [v.file_id for v in groups[0].views] == ['front','side','back','actor-front']
        assert groups[0].views[-1].source_type == 'actor'
        assert not await character_angle_groups(db, 'shot-1')
        with pytest.raises(LookupError): await character_angle_groups(db, 'missing')
        plan = (await load_project_edit(db, 'project-1')).plan
        await save_project_edit(db, 'project-1', ProjectEditSave(expected_revision=0, plan=plan))
        await db.commit()
        clip = plan.clips[1].id
        body = EditVisualPrepare(expected_revision=1, clip_id=clip, sample_mode='start', baseline_file_ids=['back','front','side'])
        evidence = await service.prepare_visual_evidence(db, 'project-1', body)
        await db.commit()
        assert len(evidence.images) == 4
        assert [i.file_id for i in evidence.images[1:]] == ['back','front','side']
        assert '背面' in evidence.images[1].label
        assert evidence == await service.prepare_visual_evidence(db, 'project-1', body)
        different = await service.prepare_visual_evidence(db, 'project-1', body.model_copy(update={'baseline_file_ids': ['front','back','side']}))
        assert different.evidence_id != evidence.evidence_id
        no_baseline = await service.prepare_visual_evidence(db, 'project-1', body.model_copy(update={'baseline_file_ids': []}))
        assert len(no_baseline.images) == 1 and no_baseline.baseline_file_ids == []
        for invalid in [['other-front'], ['front','front']]:
            with pytest.raises(ValueError, match='重复或不属于'):
                await service.prepare_visual_evidence(db, 'project-1', body.model_copy(update={'baseline_file_ids': invalid}))
        with pytest.raises(ValueError, match='最多选择1张'):
            await service.prepare_visual_evidence(db, 'project-1', body.model_copy(update={'sample_mode':'continuity'}))
        before = (await service.visual_context(db, 'project-1', clip))[1]
        (await db.get(FileItem, 'side')).checksum = 'new-pixels'
        await db.flush()
        assert before != (await service.visual_context(db, 'project-1', clip))[1]
    await engine.dispose()
