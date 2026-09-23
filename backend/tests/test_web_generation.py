"""Browser queue isolation and idempotent publication, no supplier calls."""
import pytest
from fastapi import HTTPException
from app.core.contracts.web_generation import WebImageRequest,WebRunnerUpdate
from app.services.generation import web_generation as service
from app.models.web_generation import WebGenerationAccount
from app.models.studio_shots import ShotFrameImage
from tests.test_project_video_export import _build_session,_seed_project

@pytest.mark.asyncio
async def test_browser_queue_target_dedup_claim_and_receipt():
    """Persist one task, isolate capabilities and reject cross-object updates."""
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            db.add(WebGenerationAccount(id='doubao-test',platform='doubao',display_name='测试',enabled=True,session_state='ready',supported_models=['Seedream 4.5'],heartbeat_at=service.web_accounts.now()))
            slot=ShotFrameImage(id=991,shot_detail_id='shot-1',frame_type='first',version_id=1)
            db.add(slot);await db.commit()
            request=WebImageRequest(account_id='doubao-test',request_id='browser_test_123456',target_type='frame',entity_id='shot-1',slot_id=991,expected_version=1,prompt='a building',external_transfer_confirmed=True)
            first=await service.submit(db,request)
            assert (await service.submit(db,request)).task_id==first.task_id
            other=request.model_copy(update={'request_id':'browser_test_987654'})
            with pytest.raises(HTTPException,match='相同图片'):await service.submit(db,other)
            claimed=await service.claim(db,'doubao-test',modality='any')
            assert claimed['task_id']==first.task_id
            assert await service.claim(db,'doubao-test') is None
            task=await service.get_task(db,first.task_id)
            with pytest.raises(HTTPException):service.check_token(task,'wrong')
            with pytest.raises(HTTPException):await service.report(db,task.id,claimed['token'],WebRunnerUpdate(stage='submitted'))
            result=await service.report(db,task.id,claimed['token'],WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/1001',message_id='2001'))
            for invalid in ['https://www.doubao.com/chat/local_123', 'https://www.doubao.com/chat/1001?other=1', 'https://www.doubao.com/chat/test']:
                with pytest.raises(HTTPException):
                    await service.report(db,task.id,claimed['token'],WebRunnerUpdate(stage='submitted',conversation_url=invalid,message_id='2001'))
            assert result.stage=='submitted'
            assert 'token' not in result.model_dump()
            with pytest.raises(HTTPException):await service.submit(db,request.model_copy(update={'request_id':'browser_test_other1','entity_id':'shot-2'}))
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_accounts_remain_separate_and_old_receipt_cannot_be_replaced():
    """Two accounts may own different tasks; neither can steal another task's result."""
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            for name in ['account-a','account-b']:
                db.add(WebGenerationAccount(id=name,platform='doubao',display_name=name,enabled=True,session_state='ready',supported_models=['Seedream 4.5'],heartbeat_at=service.web_accounts.now()))
            db.add_all([ShotFrameImage(id=881,shot_detail_id='shot-1',frame_type='first',version_id=1),ShotFrameImage(id=882,shot_detail_id='shot-1',frame_type='last',version_id=1)])
            await db.commit()
            for i,name in enumerate(['account-a','account-b']):
                await service.submit(db,WebImageRequest(account_id=name,request_id=f'parallel_account_00{i}',target_type='frame',entity_id='shot-1',slot_id=881+i,expected_version=1,prompt=name,external_transfer_confirmed=True))
            a=await service.claim(db,'account-a');b=await service.claim(db,'account-b')
            assert a['task_id']!=b['task_id']
            assert a['request']['account_id']=='account-a'
            assert b['request']['account_id']=='account-b'
            assert await service.claim(db,'account-a') is None
            with pytest.raises(HTTPException):service.check_token(await service.get_task(db,a['task_id']),b['token'])
            await service.report(db,a['task_id'],a['token'],WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/1002',message_id='2002'))
            with pytest.raises(HTTPException,match='不能更换'):await service.report(db,a['task_id'],a['token'],WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/1003',message_id='2003'))
    finally:await engine.dispose()

@pytest.mark.asyncio
@pytest.mark.parametrize('target_type',['frame','costume'])
@pytest.mark.parametrize('conflict',[False,True])
async def test_image_publication_is_idempotent_and_preserves_changed_slot(monkeypatch,target_type,conflict):
    """Real PNG validation plus fake storage verifies one archive and no stale overwrite."""
    from io import BytesIO
    from PIL import Image
    from fastapi import UploadFile
    from app.models.studio import FileItem,FileType
    db,engine=await _build_session()
    archives=[]
    async def archive(db,**kwargs):
        """Isolate object storage while retaining actual SQL file/artifact relations."""
        assert kwargs['file'].filename.endswith('.png')
        row=FileItem(id='web-file-1',type=FileType.image,name='result',thumbnail='',tags=[],storage_key='test.png')
        db.add(row);await db.flush();archives.append(row.id);return row
    monkeypatch.setattr(service,'upload_file',archive)
    try:
        async with db:
            await _seed_project(db)
            db.add(WebGenerationAccount(id='account',platform='doubao',display_name='account',enabled=True,session_state='ready',supported_models=['Seedream 4.5'],heartbeat_at=service.web_accounts.now()))
            if target_type=='costume':
                from app.models.studio_assets import Costume
                from app.models.studio_asset_images import CostumeImage
                db.add(Costume(id='costume-1',name='蓝色外套',style='real_people_city'))
                slot=CostumeImage(id=883,costume_id='costume-1',version_id=1)
            else:
                slot=ShotFrameImage(id=883,shot_detail_id='shot-1',frame_type='first',version_id=1)
            db.add(slot);await db.commit()
            request=WebImageRequest(account_id='account',request_id='publish_test_123456',target_type=target_type,entity_id='costume-1' if target_type=='costume' else 'shot-1',slot_id=883,expected_version=1,prompt='test',external_transfer_confirmed=True)
            accepted=await service.submit(db,request);owned=await service.claim(db,'account')
            await service.report(db,accepted.task_id,owned['token'],WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/1004',message_id='2004'))
            if conflict: slot.version_id=2
            await db.flush()
            buffer=BytesIO();Image.new('RGB',(32,32),'red').save(buffer,format='PNG');data=buffer.getvalue()
            for _ in range(2):
                result=await service.finish(db,accepted.task_id,owned['token'],UploadFile(filename='wrong.mp4',file=BytesIO(data)))
                assert result.result['published'] is (not conflict)
            assert archives==['web-file-1']
            await db.refresh(slot);assert slot.file_id==(None if conflict else 'web-file-1')
            assert (await db.get(WebGenerationAccount,'account')).active_task_id is None
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_auto_dispatch_lru_and_lost_claim_recovery():
    """Automatic assignment skips busy/stale/unsupported sessions and recovers one claim."""
    from datetime import timedelta
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            for index in range(4):
                db.add(WebGenerationAccount(id=f'pool-{index}',platform='doubao',display_name=f'Pool {index}',enabled=True,session_state='ready',supported_models=['Seedream 4.5'] if index!=2 else ['other'],heartbeat_at=service.web_accounts.now()-(timedelta(minutes=5) if index==3 else timedelta()),last_assigned_at=service.web_accounts.now()-timedelta(minutes=10-index)))
                if index<2: db.add(ShotFrameImage(id=900+index,shot_detail_id='shot-1',frame_type=['first','last','key','first'][index],version_id=1))
            await db.commit()
            for index in range(2):
                await service.submit(db,WebImageRequest(request_id=f'auto_dispatch_000{index}',target_type='frame',entity_id='shot-1',slot_id=900+index,expected_version=1,prompt=f'image {index}',external_transfer_confirmed=True))
            assert await service.claim(db,'pool-1','b'*40) is None
            first=await service.claim(db,'pool-0','a'*40)
            assert first['request']['account_id']=='pool-0'
            assert (await service.claim(db,'pool-0','a'*40))['task_id']==first['task_id']
            assert await service.claim(db,'pool-0','wrong'*8) is None
            second=await service.claim(db,'pool-1','b'*40)
            assert second['task_id']!=first['task_id']
            assert await service.claim(db,'pool-2','c'*40) is None
            assert await service.claim(db,'pool-3','d'*40) is None
            restored=await service.resume(db,first['task_id'],'a'*40)
            assert restored['request']==first['request']
    finally:await engine.dispose()
@pytest.mark.asyncio
async def test_account_profile_pairing_is_unique_and_cannot_move():
    """One session cannot masquerade as two accounts or replace a paired identity."""
    from app.core.contracts.web_generation import WebAccountHeartbeat
    db,engine=await _build_session()
    try:
        async with db:
            for name in ['first','second']:
                db.add(WebGenerationAccount(id=name,platform='doubao',display_name=name,enabled=True))
            await db.commit()
            body=WebAccountHeartbeat(profile_key='unique_profile_12345',session_state='ready',supported_models=['Seedream 4.5'])
            await service.web_accounts.heartbeat(db,'first',body)
            with pytest.raises(HTTPException):await service.web_accounts.heartbeat(db,'second',body)
            with pytest.raises(HTTPException):await service.web_accounts.heartbeat(db,'first',body.model_copy(update={'profile_key':'different_profile_12345'}))
    finally:await engine.dispose()


def test_account_migration_roundtrip_preserves_existing_tables():
    """Run the actual new revision in isolation, retaining a pre-existing sentinel row."""
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine,text,inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).parents[1]/'alembic/versions/a3c5e7f9b015_web_generation_accounts.py'
    spec=importlib.util.spec_from_file_location('web_account_revision',path)
    revision=importlib.util.module_from_spec(spec);spec.loader.exec_module(revision)
    engine=create_engine('sqlite://')
    with engine.begin() as conn:
        conn.execute(text('CREATE TABLE sentinel (id INTEGER PRIMARY KEY)'))
        conn.execute(text('INSERT INTO sentinel VALUES (1)'))
        with Operations.context(MigrationContext.configure(conn)):
            revision.upgrade()
            assert 'profile_key' in {c['name'] for c in inspect(conn).get_columns('web_generation_accounts')}
            revision.downgrade()
        assert conn.scalar(text('SELECT id FROM sentinel'))==1
    engine.dispose()

@pytest.mark.asyncio
async def test_video_queue_cannot_be_claimed_by_image_worker(monkeypatch):
    """A shared model name does not authorize an image worker to process video."""
    from app.services.generation import web_models
    # Isolate publication from the real adapter parameter gate using an explicit offline fixture.
    monkeypatch.setattr(web_models, "AUTOMATIC_MODELS", {("doubao", "video", "observed-video")})
    monkeypatch.setattr(web_models, "video_automation_issues", lambda *args, **kwargs: [])
    from app.core.contracts.web_generation import WebVideoRequest
    from app.models.studio_shots import Shot
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            db.add(WebGenerationAccount(id='video-account',platform='doubao',display_name='test',enabled=True,session_state='ready',supported_models=['observed-video'],heartbeat_at=service.web_accounts.now()))
            await db.commit()
            shot=await db.get(Shot,'shot-1')
            body=WebVideoRequest(request_id='video_isolation_001',entity_id=shot.id,expected_version=shot.generated_video_version_id,prompt='building',requested_model='observed-video',duration_seconds=5,aspect_ratio='16:9',reference_mode='text',external_transfer_confirmed=True)
            task=await service.submit(db,body)
            assert await service.claim(db,'video-account','a'*40) is None
            owned=await service.claim(db,'video-account','b'*40,'video')
            assert owned['task_id']==task.task_id
            assert await service.claim(db,'video-account','b'*40,'image') is None
    finally:await engine.dispose()


def test_video_specs_and_reference_roles():
    """Reject ambiguous frame inputs and flag mismatched originals before publication."""
    from app.core.contracts.web_generation import WebVideoRequest
    from app.services.generation.web_media import video_spec_issues
    from pydantic import ValidationError
    base=dict(request_id='video_specs_123456',entity_id='shot-1',expected_version=1,prompt='building',requested_model='observed-video',duration_seconds=5,aspect_ratio='16:9',resolution='720p',reference_mode='text',external_transfer_confirmed=True)
    body=WebVideoRequest(**base)
    assert video_spec_issues(body,dict(width=1280,height=720,duration_ms=5000))==[]
    assert len(video_spec_issues(body,dict(width=1080,height=1920,duration_ms=10000)))==3
    with pytest.raises(ValidationError):WebVideoRequest(**{**base,'aspect_ratio':'0:9'})
    with pytest.raises(ValidationError):WebVideoRequest(**{**base,'reference_mode':'first_last_frames','reference_file_ids':['one']})


@pytest.mark.asyncio
async def test_duplicate_remote_rejected_even_during_recovery():
    """A late downloading receipt cannot bypass the one-result/one-task binding."""
    from app.models.task import GenerationTask
    db,engine=await _build_session()
    try:
        async with db:
            account=WebGenerationAccount(id='same-account',platform='doubao',display_name='same')
            db.add(account)
            remote={'conversation_url':'https://www.doubao.com/chat/999','message_id':'888'}
            for index in range(2):
                db.add(GenerationTask(id=f'remote_task_{index}',mode='async_polling',task_kind=service.KIND,status='running',executor_type='windows_browser',payload={'assigned_account_id':account.id,'runner_token_hash':service.hashlib.sha256(b'token').hexdigest(),**({'remote':remote} if index==0 else {})}))
            await db.flush()
            with pytest.raises(HTTPException,match='已经绑定'):
                await service.report(db,'remote_task_1','token',WebRunnerUpdate(stage='downloading',**remote))
    finally:await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize('stale,wrong_spec',[(False,False),(True,False),(False,True)])
async def test_video_publication_checks_version_specs_and_preserves_shot_status(monkeypatch,stale,wrong_spec):
    """Video archives are idempotent and cannot overwrite newer or mismatching output."""
    from app.services.generation import web_models
    # Isolate publication from the real adapter parameter gate using an explicit offline fixture.
    monkeypatch.setattr(web_models, "AUTOMATIC_MODELS", {("doubao", "video", "observed-video")})
    monkeypatch.setattr(web_models, "video_automation_issues", lambda *args, **kwargs: [])
    from io import BytesIO
    from fastapi import UploadFile
    from app.models.studio import FileItem,FileType
    from app.models.studio_shots import Shot
    from app.core.contracts.web_generation import WebVideoRequest
    db,engine=await _build_session()
    archives=[]
    async def metadata(data,modality):
        """Isolate ffprobe; real MP4 parsing is also exercised in the Docker smoke check."""
        assert modality=='video'
        return dict(extension='mp4',mime='video/mp4',width=1280,height=720,duration_ms=10000 if wrong_spec else 5000)
    async def archive(db,**kwargs):
        """Keep SQL output relations real without contacting business object storage."""
        row=FileItem(id='web-video-file',type=FileType.video,name='video',thumbnail='',tags=[],storage_key='test.mp4')
        db.add(row);await db.flush();archives.append(row.id);return row
    monkeypatch.setattr(service,'inspect_media',metadata)
    monkeypatch.setattr(service,'upload_file',archive)
    try:
        async with db:
            await _seed_project(db)
            db.add(WebGenerationAccount(id='video-account',platform='doubao',display_name='test',enabled=True,session_state='ready',supported_models=['observed-video'],heartbeat_at=service.web_accounts.now()))
            await db.commit()
            shot=await db.get(Shot,'shot-1');previous_status=shot.status
            body=WebVideoRequest(request_id='video_archive_001',entity_id=shot.id,expected_version=shot.generated_video_version_id,prompt='building',requested_model='observed-video',duration_seconds=5,aspect_ratio='16:9',resolution='720p',reference_mode='text',external_transfer_confirmed=True)
            accepted=await service.submit(db,body)
            owned=await service.claim(db,'video-account','a'*40,'any')
            await service.report(db,accepted.task_id,owned['token'],WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/456',message_id='789'))
            if stale:shot.generated_video_version_id+=1;await db.flush()
            for _ in range(2):
                result=await service.finish(db,accepted.task_id,owned['token'],UploadFile(filename='result.mp4',file=BytesIO(b'fixture')))
                assert result.result['published']==(not stale and not wrong_spec)
            await db.refresh(shot)
            assert shot.status==previous_status
            assert archives==['web-video-file']
            assert (shot.generated_video_file_id=='web-video-file')==(not stale and not wrong_spec)
            assert bool(result.result['spec_issues'])==wrong_spec
    finally:await engine.dispose()


def test_cancel_requested_web_task_does_not_look_running():
    """A stopped browser task must not advertise a resumable generation or discard its receipt."""
    from types import SimpleNamespace
    task=SimpleNamespace(id='cancelled-web',status='running',cancel_requested=True,payload={'web_stage':'needs_user','remote':{'message_id':'123'}},error='old timeout',result=None)
    result=service.read_task(task)
    assert result.status=='cancelled' and result.stage=='cancelled'
    assert task.payload['remote']['message_id']=='123'


@pytest.mark.asyncio
@pytest.mark.parametrize('stage',['preparing','submission_unknown','submitted','downloading'])
async def test_browser_cancel_finishes_releases_and_rejects_late_publication(stage):
    """Cancellation needs no Celery ack, retains evidence and cannot clear another lease."""
    from app.models.task import GenerationTask
    db,engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            account=WebGenerationAccount(id='cancel-account',platform='doubao',display_name='cancel',enabled=True,session_state='ready',supported_models=['Seedream 4.5'],heartbeat_at=service.web_accounts.now())
            db.add(account)
            db.add(ShotFrameImage(id=980,shot_detail_id='shot-1',frame_type='first',version_id=1))
            await db.commit()
            request=WebImageRequest(account_id=account.id,request_id='cancel_browser_0001',target_type='frame',entity_id='shot-1',slot_id=980,expected_version=1,prompt='cancel',external_transfer_confirmed=True)
            result=await service.submit(db,request)
            owned=await service.claim(db,account.id)
            await service.report(db,result.task_id,owned['token'],WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/1234',message_id='12345'))
            task=await db.get(GenerationTask,result.task_id)
            task.payload={**task.payload,'web_stage':stage}
            account.session_state='offline';await db.flush()
            assert await service.cancel_browser_task(db,result.task_id,'user')
            task=await db.get(GenerationTask,result.task_id)
            await db.refresh(account)
            assert task.status=='cancelled' and task.finished_at and account.active_task_id is None
            assert task.payload['remote']['message_id']=='12345'
            assert (await service.resume(db,task.id,owned['token']))['status']=='cancelled'
            with pytest.raises(HTTPException):
                await service.report(db,task.id,owned['token'],WebRunnerUpdate(stage='downloading'))
            with pytest.raises(HTTPException):
                await service.resume(db,task.id,'wrong-token')
            account.session_state='ready';await db.flush()
            new=await service.submit(db,request.model_copy(update={'request_id':'cancel_browser_0002'}))
            next_owned=await service.claim(db,account.id)
            assert next_owned['task_id']==new.task_id and new.task_id!=task.id
            await service.cancel_browser_task(db,result.task_id)
            await db.refresh(account)
            assert account.active_task_id==new.task_id
            assert (await service.resume(db,task.id,owned['token']))['status']=='cancelled'
            await db.refresh(account)
            assert account.active_task_id==new.task_id
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_multi_result_archive_retry_and_adoption(monkeypatch):
    """Multiple originals share one task; retries and adoption cannot overwrite newer choices."""
    from io import BytesIO
    from PIL import Image
    from fastapi import UploadFile
    from sqlalchemy import select
    from app.models.studio import FileItem, FileType
    from app.models.generation_artifacts import GenerationArtifact
    from app.services.generation import web_handoff
    from app.core.contracts.web_generation import WebExportAdoption
    db, engine = await _build_session()
    archives = []
    async def archive(db, **kwargs):
        """Keep database relationships real while isolating object storage."""
        row = FileItem(id=f'multi-file-{len(archives)}', type=FileType.image, name='candidate', thumbnail='', tags=[], storage_key='test.png')
        db.add(row)
        await db.flush()
        archives.append(row.id)
        return row
    monkeypatch.setattr(service, 'upload_file', archive)
    stream = BytesIO()
    Image.new('RGB', (32, 32)).save(stream, format='PNG')
    try:
        async with db:
            await _seed_project(db)
            account = WebGenerationAccount(id='multi-account', platform='doubao', display_name='test', enabled=True, session_state='ready', supported_models=['Seedream 4.5'], heartbeat_at=service.web_accounts.now())
            slot = ShotFrameImage(id=989, shot_detail_id='shot-1', frame_type='first', version_id=1)
            db.add_all([account, slot])
            await db.commit()
            accepted = await service.submit(db, WebImageRequest(account_id=account.id, request_id='multiple_results_0001', target_type='frame', entity_id='shot-1', slot_id=989, expected_version=1, prompt='identical prompt', external_transfer_confirmed=True))
            owned = await service.claim(db, account.id)
            await service.report(db, accepted.task_id, owned['token'], WebRunnerUpdate(stage='submitted', conversation_url='https://www.doubao.com/chat/1007', message_id='2007', binding_version=2, user_message_id='2006'))
            for _ in range(2):
                result = await service.finish_many(db, accepted.task_id, owned['token'], [UploadFile(filename='result.png', file=BytesIO(stream.getvalue())) for i in range(2)])
                assert result.status == 'succeeded'
                assert result.result['candidate_count'] == 2
                assert len(result.result['files']) == 2
            assert len(archives) == 2
            await db.refresh(slot)
            await db.refresh(account)
            assert slot.file_id is None and slot.version_id == 1
            assert account.active_task_id is None
            artifacts = list(await db.scalars(select(GenerationArtifact).where(GenerationArtifact.task_id == accepted.task_id).order_by(GenerationArtifact.ordinal)))
            assert len(artifacts) == 2
            for _ in range(2):
                assert (await web_handoff.adopt_export(db, accepted.task_id, artifacts[1].id, WebExportAdoption(expected_version=1)))['published']
            with pytest.raises(HTTPException):
                await web_handoff.adopt_export(db, accepted.task_id, artifacts[0].id, WebExportAdoption(expected_version=1))
            await db.refresh(slot)
            assert slot.file_id == artifacts[1].file_id
            # An explicit user choice can switch candidates using the current file/version snapshot.
            current_version=slot.version_id
            choice=WebExportAdoption(expected_version=current_version,expected_current_file_id=slot.file_id)
            await web_handoff.adopt_export(db,accepted.task_id,artifacts[0].id,choice)
            await db.refresh(slot)
            assert slot.file_id==artifacts[0].file_id
            with pytest.raises(HTTPException):
                await web_handoff.adopt_export(db,accepted.task_id,artifacts[1].id,choice)
            groups=await web_handoff.list_jobs(db,target_type='frame',entity_id='shot-1',slot_id=989)
            assert len(groups)==1 and groups[0]['candidate_count']==2
            assert await web_handoff.list_jobs(db,target_type='prop',entity_id='shot-1',slot_id=989)==[]
            assert await web_handoff.list_jobs(db,target_type='frame',entity_id='other',slot_id=989)==[]
            assert await web_handoff.list_jobs(db,target_type='frame',entity_id='shot-1',slot_id=990)==[]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_v2_binding_is_immutable_and_exclusive_per_account():
    """Same prompt cannot substitute for a different task, user message or conversation."""
    from app.models.task import GenerationTask
    db, engine = await _build_session()
    try:
        async with db:
            db.add(WebGenerationAccount(id='identity-account', platform='doubao', display_name='test'))
            for i in range(2):
                db.add(GenerationTask(id=f'identity-task-{i}', mode='async_polling', task_kind=service.KIND, status='running', executor_type='windows_browser', payload={'assigned_account_id':'identity-account', 'runner_token_hash':service.hashlib.sha256(b'token').hexdigest()}))
            await db.flush()
            body = WebRunnerUpdate(stage='submitting', conversation_url='https://www.doubao.com/chat/123456', binding_version=2, user_message_id='999')
            await service.report(db, 'identity-task-0', 'token', body)
            with pytest.raises(HTTPException, match='不可更换'):
                await service.report(db, 'identity-task-0', 'token', body.model_copy(update={'user_message_id':'998'}))
            with pytest.raises(HTTPException, match='另一任务'):
                await service.report(db, 'identity-task-1', 'token', body)
    finally:
        await engine.dispose()
