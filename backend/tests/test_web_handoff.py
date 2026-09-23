"""Offline cross-platform handoff, original preservation and watermark-export regression."""
from io import BytesIO
import pytest
from PIL import Image
from fastapi import HTTPException, UploadFile
from app.core.contracts.web_generation import WebImageRequest,WebHandoffReceipt,WebOfficialExportRequest,WebHandoffProgress,WebExportAdoption
from app.services.generation import web_generation as web,web_handoff as handoff
from app.models.web_generation import WebGenerationAccount
from app.models.studio_shots import ShotFrameImage
from app.models.studio import FileItem,FileType
from tests.test_project_video_export import _build_session,_seed_project


def png(color='red'):
    """Create local media fixtures without a platform or network call."""
    data=BytesIO();Image.new('RGB',(32,32),color).save(data,format='PNG');return data.getvalue()


def request(platform='jimeng'):
    """Freeze one first-frame target with an explicitly named webpage model."""
    return WebImageRequest(platform=platform,execution_mode='manual',request_id='manual_handoff_1234',target_type='frame',entity_id='shot-1',slot_id=950,expected_version=1,prompt='building',requested_model='actual webpage model',external_transfer_confirmed=True)


async def seed(db,platform='jimeng'):
    """Reserve existing SQL business objects while leaving login unverified."""
    await _seed_project(db)
    db.add(WebGenerationAccount(id='manual-account',platform=platform,display_name='创作账号',enabled=True))
    db.add(ShotFrameImage(id=950,shot_detail_id='shot-1',frame_type='first',version_id=1))
    await db.commit()


@pytest.mark.asyncio
@pytest.mark.parametrize('platform',list(handoff.PLATFORM_HOSTS))
async def test_all_platforms_can_prepare_manual_handoff_without_browser_dispatch(platform):
    """Registration is sufficient for an explicit handoff, never for automatic generation."""
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db,platform)
            task=await web.submit(db,request(platform))
            manifest=await handoff.manifest(db,task.task_id)
            assert manifest['manual'] is True
            assert manifest['request']['platform']==platform
            assert manifest['account_id']=='manual-account'
            assert (await web.submit(db,request(platform))).task_id==task.task_id
            assert await web.claim(db,'manual-account','a'*40) is None
            await handoff.release_unsent(db,task.task_id)
            assert (await db.get(WebGenerationAccount,'manual-account')).active_task_id is None
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_sent_handoff_keeps_original_account():
    """An uncertain platform submission cannot be released as if it never happened."""
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db)
            task=await web.submit(db,request());manifest=await handoff.manifest(db,task.task_id)
            with pytest.raises(HTTPException):await handoff.progress(db,task.task_id,WebHandoffProgress(input_fingerprint='0'*64,stage='submitted'))
            await handoff.progress(db,task.task_id,WebHandoffProgress(input_fingerprint=manifest['input_fingerprint'],stage='submission_unknown'))
            with pytest.raises(HTTPException):await handoff.release_unsent(db,task.task_id)
            assert (await db.get(WebGenerationAccount,'manual-account')).active_task_id==task.task_id
    finally:await engine.dispose()


def test_official_result_urls_reject_lookalikes_and_cross_region():
    """No URL fetching: validate only exact provenance host names and HTTPS."""
    for bad in ['https://jimeng.jianying.com.evil.test/result/1','https://user@jimeng.jianying.com/result/1','http://jimeng.jianying.com/result/1','https://localhost/result/1']:
        with pytest.raises(HTTPException):handoff.verify_url('jimeng',bad)
    with pytest.raises(HTTPException):handoff.verify_url('hailuo','https://hailuoai.video/result/1')
    assert handoff.verify_url('jimeng','https://jimeng.jianying.com/result/1')


@pytest.mark.asyncio
async def test_original_clean_export_and_explicit_adoption_are_isolated(monkeypatch):
    """Archive a real PNG once, preserve it, then explicitly adopt only its matching export."""
    archives=[]
    async def archive(db,**kwargs):
        """Use real file/artifact SQL rows and fake only remote object storage."""
        file_id=f'file-{len(archives)}'
        row=FileItem(id=file_id,type=FileType.image,name='fixture',thumbnail='',tags=[],storage_key=file_id+'.png')
        db.add(row);await db.flush();archives.append(file_id);return row
    monkeypatch.setattr(web,'upload_file',archive)
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db)
            task=await web.submit(db,request());manifest=await handoff.manifest(db,task.task_id)
            receipt=WebHandoffReceipt(input_fingerprint=manifest['input_fingerprint'],conversation_url='https://jimeng.jianying.com/result/123',message_id='123',observed_model='actual webpage model',account_and_input_confirmed=True,original_download_confirmed=True,watermark='visible')
            with pytest.raises(HTTPException):await handoff.result(db,task.task_id,receipt.model_copy(update={'observed_model':'different model'}),UploadFile(file=BytesIO(png())))
            for _ in range(2):
                result=await handoff.result(db,task.task_id,receipt,UploadFile(file=BytesIO(png())))
                assert result.result['published']
            assert archives==['file-0']
            body=WebOfficialExportRequest(request_id='official_export_1234',source_file_id='file-0',conversation_url=receipt.conversation_url,message_id='123',export_evidence='官网无水印下载选项',same_result_confirmed=True)
            with pytest.raises(HTTPException,match='完全相同'):
                await handoff.official_export(db,task.task_id,body,UploadFile(file=BytesIO(png())))
            for _ in range(2):
                exported=await handoff.official_export(db,task.task_id,body,UploadFile(file=BytesIO(png('blue'))))
                assert not exported['published']
            assert archives==['file-0','file-1']
            slot=await db.get(ShotFrameImage,950);await db.refresh(slot)
            assert slot.file_id=='file-0'
            with pytest.raises(HTTPException):await handoff.official_export(db,task.task_id,body,UploadFile(file=BytesIO(png('green'))))
            with pytest.raises(HTTPException):await handoff.adopt_export(db,task.task_id,exported['artifact_id'],WebExportAdoption(expected_version=1))
            adopted=await handoff.adopt_export(db,task.task_id,exported['artifact_id'],WebExportAdoption(expected_version=2))
            await db.refresh(slot);assert slot.file_id=='file-1' and adopted['published']
            assert await db.get(FileItem,'file-0') is not None
            assert len(await handoff.artifacts(db,task.task_id))==2
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_multipart_receipt_matches_generated_client_shape(monkeypatch):
    """Exercise actual multipart parsing so a generated client can send JSON plus a Blob."""
    import json,httpx
    from fastapi import FastAPI
    from app.api.v1.routes.studio.web_generation import router
    from app.dependencies import get_db
    from app.core.contracts.web_generation import WebTaskRead
    async def db():
        """This transport test performs no database or storage writes."""
        yield None
    async def result(db,task_id,receipt,file):
        """Inspect the actual parsed multipart receipt and uploaded bytes."""
        assert receipt.observed_model=='actual webpage model'
        assert await file.read()==b'fixture'
        return WebTaskRead(task_id=task_id,status='succeeded',stage='completed')
    monkeypatch.setattr(handoff,'result',result)
    app=FastAPI();app.include_router(router);app.dependency_overrides[get_db]=db
    receipt=dict(input_fingerprint='a'*64,conversation_url='https://jimeng.jianying.com/result/123',message_id='123',observed_model='actual webpage model',account_and_input_confirmed=True,original_download_confirmed=True)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
        response=await client.post('/tasks/task-1/handoff-result',data={'receipt_json':json.dumps(receipt)},files={'file':('file.png',b'fixture','image/png')})
        assert response.status_code==200,response.text
        bad=await client.post('/tasks/task-1/handoff-result',data={'receipt_json':'{}'},files={'file':('file.png',b'fixture','image/png')})
        assert bad.status_code==422


@pytest.mark.asyncio
async def test_busy_manual_account_queues_without_cross_target_reassignment():
    """One account serializes separate tasks and an uncertain receipt keeps the next queued."""
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db)
            first=await web.submit(db,request())
            second=await web.submit(db,request().model_copy(update={'request_id':'second_manual_123456','prompt':'different shot draft'}))
            assert second.status=='pending'
            assert (await web.get_task(db,second.task_id)).executor_type=='manual_handoff'
            assert await web.claim(db,'manual-account','b'*40) is None
            await handoff.release_unsent(db,first.task_id)
            next_task=await web.get_task(db,second.task_id)
            assert next_task.status=='running'
            assert next_task.payload['assigned_account_id']=='manual-account'
            assert (await db.get(WebGenerationAccount,'manual-account')).active_task_id==second.task_id
            assert next_task.payload['web_request']['prompt']=='different shot draft'
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_web_lab_result_is_bound_to_original_session(monkeypatch):
    """Two lab sessions cannot steal each other's task result or user prompt."""
    from app.models.experiment_sessions import ExperimentSession,ExperimentMessage
    from sqlalchemy import select
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db)
            db.add_all([ExperimentSession(id='lab-a',lab_type='image',title='A'),ExperimentSession(id='lab-b',lab_type='image',title='B')]);await db.flush()
            body=request().model_copy(update={'target_type':'lab_image','entity_id':'lab-a','slot_id':None})
            accepted=await web.submit(db,body)
            manifest=await handoff.manifest(db,accepted.task_id)
            async def save_file(db,**kwargs):
                """Persist only a local fake file row; no RustFS/network access."""
                row=FileItem(id='lab-generated',name='lab',type=FileType.image,storage_key='fixture/lab.png');db.add(row);await db.flush();return row
            monkeypatch.setattr(web,'upload_file',save_file)
            receipt=WebHandoffReceipt(input_fingerprint=manifest['input_fingerprint'],conversation_url='https://jimeng.jianying.com/ai-tool/result/lab',message_id='lab-output',observed_model=body.requested_model,account_and_input_confirmed=True,original_download_confirmed=True)
            result=await handoff.result(db,accepted.task_id,receipt,UploadFile(filename='image.png',file=BytesIO(png())))
            assert result.status=='succeeded'
            message=await db.scalar(select(ExperimentMessage).where(ExperimentMessage.task_id==accepted.task_id))
            assert message.session_id=='lab-a' and message.payload['result']['file_id']=='lab-generated'
            assert not list(await db.scalars(select(ExperimentMessage).where(ExperimentMessage.session_id=='lab-b')))
            assert (await web.submit(db,body)).task_id==accepted.task_id
            assert len(list(await db.scalars(select(ExperimentMessage).where(ExperimentMessage.session_id=='lab-a'))))==2
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_web_model_catalog_does_not_import_api_names():
    """Unknown web products remain unverified rather than inheriting API model IDs."""
    from app.services.generation.web_accounts import model_catalog
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db)
            data=await model_catalog(db,'jimeng','image')
            assert any(item['name']=='图片 3.0' for item in data['models'])
            assert not any('req_key' in item['name'] or 'jimeng_t2i' in item['name'] for item in data['models'])
            assert (await model_catalog(db,'yuanbao','video'))['models']==[]
            with pytest.raises(Exception):WebImageRequest.model_validate({**request().model_dump(),'requested_model':'   '})
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_web_edit_archives_then_explicitly_adopts_its_frozen_shot(monkeypatch):
    """A library source can be edited, but completion never silently replaces the current shot."""
    from app.models.studio_shots import Shot
    from app.models.generation_artifacts import GenerationArtifact
    from app.core.contracts.web_generation import WebVideoRequest
    from sqlalchemy import select
    db,engine=await _build_session()
    async def metadata(data,modality):
        """Use bounded media metadata; separate ffprobe smoke covers real MP4 decoding."""
        return dict(extension='mp4',mime='video/mp4',width=1280,height=720,duration_ms=5000)
    async def archive(db,**kwargs):
        """Keep relational publication real while avoiding object-store access."""
        row=FileItem(id='edit-result',name='edit',type=FileType.video,storage_key='fixture/edit.mp4');db.add(row);await db.flush();return row
    monkeypatch.setattr(web,'inspect_media',metadata);monkeypatch.setattr(web,'upload_file',archive)
    try:
        async with db:
            await seed(db)
            db.add(FileItem(id='library-source',name='source',type=FileType.video,storage_key='fixture/source.mp4'));await db.flush()
            shot=await db.get(Shot,'shot-1');original=shot.generated_video_file_id;version=shot.generated_video_version_id
            body=WebVideoRequest(platform='jimeng',execution_mode='manual',request_id='library_edit_12345',target_type='shot_edit',entity_id=shot.id,expected_version=version,source_video_file_id='library-source',prompt='edit light',requested_model='web edit model',duration_seconds=5,aspect_ratio='16:9',reference_mode='text',external_transfer_confirmed=True)
            accepted=await web.submit(db,body);manifest=await handoff.manifest(db,accepted.task_id)
            receipt=WebHandoffReceipt(input_fingerprint=manifest['input_fingerprint'],conversation_url='https://jimeng.jianying.com/ai-tool/result/edit',message_id='edit-output',observed_model=body.requested_model,account_and_input_confirmed=True,original_download_confirmed=True)
            result=await handoff.result(db,accepted.task_id,receipt,UploadFile(filename='output.mp4',file=BytesIO(b'offline-video')))
            assert not result.result['published'];await db.refresh(shot);assert shot.generated_video_file_id==original
            artifact=await db.scalar(select(GenerationArtifact).where(GenerationArtifact.task_id==accepted.task_id))
            with pytest.raises(HTTPException):await handoff.adopt_export(db,accepted.task_id,artifact.id,WebExportAdoption(expected_version=version+1))
            adopted=await handoff.adopt_export(db,accepted.task_id,artifact.id,WebExportAdoption(expected_version=version))
            assert adopted['published'];await db.refresh(shot);assert shot.generated_video_file_id=='edit-result'
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_manual_subject_groups_freeze_each_media_kind_and_group():
    """Subject grouping survives submission; files cannot be flattened or retyped silently."""
    from app.core.contracts.web_generation import WebVideoRequest
    from app.models.generation_artifacts import GenerationTaskMediaReference
    from sqlalchemy import select
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db)
            for id,kind in [('portrait',FileType.image),('motion',FileType.video),('voice',FileType.audio)]:db.add(FileItem(id=id,name=id,type=kind,storage_key='fixture/'+id))
            await db.flush()
            body=WebVideoRequest(platform='jimeng',execution_mode='manual',request_id='group_handoff_1234',entity_id='shot-1',expected_version=1,prompt='same character',requested_model='web group model',duration_seconds=5,aspect_ratio='16:9',reference_mode='subjects',subject_groups=[{'name':'妈妈','media':[{'file_id':'portrait','media_kind':'image'},{'file_id':'motion','media_kind':'video'},{'file_id':'voice','media_kind':'audio'}]}],external_transfer_confirmed=True)
            task=await web.submit(db,body)
            rows=list(await db.scalars(select(GenerationTaskMediaReference).where(GenerationTaskMediaReference.task_id==task.task_id).order_by(GenerationTaskMediaReference.ordinal)))
            assert [row.media_kind for row in rows]==['image','video','audio']
            assert [row.ordinal for row in rows]==[0,1,2]
            manifest=await handoff.manifest(db,task.task_id)
            assert manifest['request']['subject_groups'][0]['name']=='妈妈'
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_web_region_keeps_source_pixels_and_platform_original(monkeypatch):
    """Manual region editing reuses local compositing and preserves the unmodified platform download."""
    from app.core.contracts.generation import ImageEditRegion
    saved_bytes=[]
    db,engine=await _build_session()
    async def archive(db,file,**kwargs):
        """Inspect actual stored image bytes without external storage."""
        saved_bytes.append(await file.read())
        row=FileItem(id='region-'+str(len(saved_bytes)),name='region',type=FileType.image,storage_key='fixture/region');db.add(row);await db.flush();return row
    async def source(*args):
        """Fixture stands in for the already separately tested frozen-file resolver."""
        return png('red'),'image/png','fixture'
    monkeypatch.setattr(web,'upload_file',archive);monkeypatch.setattr(web,'frozen_reference_content',source)
    try:
        async with db:
            await seed(db);db.add(FileItem(id='source-image',name='source',type=FileType.image,storage_key='fixture/source'));await db.flush()
            body=request().model_copy(update={'reference_file_ids':['source-image'],'edit_region':ImageEditRegion(x=.25,y=.25,width=.5,height=.5)})
            accepted=await web.submit(db,body);manifest=await handoff.manifest(db,accepted.task_id)
            receipt=WebHandoffReceipt(input_fingerprint=manifest['input_fingerprint'],conversation_url='https://jimeng.jianying.com/ai-tool/result/region',message_id='region-output',observed_model=body.requested_model,account_and_input_confirmed=True,original_download_confirmed=True)
            result=await handoff.result(db,accepted.task_id,receipt,UploadFile(filename='image.png',file=BytesIO(png('blue'))))
            assert len(saved_bytes)==2
            output=Image.open(BytesIO(saved_bytes[1]));assert output.getpixel((0,0))==(255,0,0);assert output.getpixel((16,16))==(0,0,255)
            assert result.result['raw_original_file_id']=='region-1'
            assert result.result['file_id']=='region-2'
    finally:await engine.dispose()
