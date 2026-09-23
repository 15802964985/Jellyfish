"""Local browser generation queue, frozen references and CAS publication.

No Celery outbox: the dedicated Windows worker claims these tasks explicitly.
The normal API generation path and configured model identities remain untouched.
"""
from datetime import datetime, timedelta, timezone
from app.models.web_generation import WebGenerationAccount
from app.services.generation import web_accounts
from uuid import uuid5, NAMESPACE_URL
from io import BytesIO
import re
import hashlib
import secrets
from fastapi import HTTPException, UploadFile
from app.models.studio_shots import Shot
from app.services.generation.web_media import inspect_media, video_spec_issues
from sqlalchemy import select, update
from app.core.contracts.web_generation import WebImageRequest, WebVideoRequest, WebTaskRead
from app.models.task import GenerationTask
from app.models.task_links import GenerationTaskLink
from app.models.generation_artifacts import GenerationArtifact, GenerationTaskMediaReference
from app.models.studio_asset_images import ActorImage, CharacterImage, SceneImage, PropImage, CostumeImage
from app.models.studio_shots import ShotFrameImage
from app.core.contracts.media import MediaReference
from app.services.generation.files import FileResolver
from app.services.studio.files import upload_file

SLOTS={'actor':(ActorImage,'actor_id'),'character':(CharacterImage,'character_id'),
       'scene':(SceneImage,'scene_id'),'prop':(PropImage,'prop_id'),
       'costume':(CostumeImage,'costume_id'),'frame':(ShotFrameImage,'shot_detail_id')}
KIND='web_image_generation'
VIDEO_KIND='web_video_generation'
WEB_KINDS=[KIND,VIDEO_KIND]


def read_task(task):
    """Expose business status without exposing the executor capability token."""
    return WebTaskRead(task_id=task.id,status='cancelled' if task.cancel_requested else task.status,stage='cancelled' if task.cancel_requested else task.payload.get('web_stage','queued'),error='已停止自动操作；官网已提交内容不代表被取消，原回执保留，取消收尾后释放账号' if task.cancel_requested else task.error or '',result=task.result)


async def settle_cancelled(db, task):
    """Finish local cancellation and release only this task's lease; preserve remote evidence.

    This stops Jellyfish publication, not a generation already accepted by the website.
    Late reports remain rejected by check_token and cannot overwrite another task.
    """
    if task.executor_type != 'windows_browser' or not task.cancel_requested:
        return False
    if task.status == 'succeeded':
        return False
    now = web_accounts.now()
    task.status = 'cancelled'
    task.cancelled_at = task.cancelled_at or now
    task.finished_at = task.finished_at or now
    task.lease_expires_at = None
    task.payload = {**task.payload, 'web_stage': 'cancelled'}
    await db.execute(update(WebGenerationAccount).where(
        WebGenerationAccount.active_task_id == task.id,
        WebGenerationAccount.id == task.payload.get('assigned_account_id'),
    ).values(active_task_id=None))
    await db.flush()
    return True


async def cancel_browser_task(db, task_id, reason=None):
    """Handle browser cancellation without waiting for a nonexistent Celery acknowledgement."""
    task = await db.scalar(select(GenerationTask).where(GenerationTask.id == task_id).with_for_update())
    if not task or task.executor_type != 'windows_browser':
        return False
    if task.status not in ['succeeded', 'failed', 'cancelled']:
        task.cancel_requested = True
        task.cancel_requested_at = task.cancel_requested_at or web_accounts.now()
        task.cancel_reason = (reason or '').strip() or None
    await settle_cancelled(db, task)
    return True


async def get_task(db,task_id,lock=False):
    """Restrict all browser endpoints to browser-owned tasks."""
    query=select(GenerationTask).where(GenerationTask.id==task_id,GenerationTask.task_kind.in_(WEB_KINDS))
    if lock: query=query.with_for_update()
    task=await db.scalar(query)
    if not task: raise HTTPException(404,'网页任务不存在')
    return task


async def submit(db,body:WebImageRequest|WebVideoRequest):
    """Validate and freeze the target and references in the same DB transaction."""
    from app.services.generation.web_models import AUTO_PLATFORMS
    if body.execution_mode=='browser' and body.platform not in AUTO_PLATFORMS: raise HTTPException(409,'该平台网页生成尚待独立验收，未开放提交')
    is_video=isinstance(body,WebVideoRequest)
    is_lab=body.target_type in ['lab_image','lab_video']
    if is_lab:
        from app.models.experiment_sessions import ExperimentSession
        slot=await db.scalar(select(ExperimentSession).where(ExperimentSession.id==body.entity_id).with_for_update())
        if slot and slot.lab_type!=('video' if is_video else 'image'): raise HTTPException(422,'实验室类型不匹配')
    elif is_video:
        slot=await db.scalar(select(Shot).where(Shot.id==body.entity_id).with_for_update())
    else:
        model,parent=SLOTS[body.target_type]
        slot=await db.scalar(select(model).where(model.id==body.slot_id,getattr(model,parent)==body.entity_id).with_for_update())
    if not slot: raise HTTPException(404,'生成目标不存在或不属于当前对象')
    task_id=uuid5(NAMESPACE_URL,'jellyfish-web:'+body.request_id).hex
    existing=await db.get(GenerationTask,task_id)
    request=body.model_dump(mode='json')
    if existing:
        if existing.payload.get('web_request')!=request: raise HTTPException(409,'请求编号已用于其他内容')
        return read_task(existing)
    if body.account_id:
        account=await db.get(WebGenerationAccount,body.account_id)
        if not account or not account.enabled or account.platform!=body.platform: raise HTTPException(409,'网页账号未启用或平台不匹配')
    from app.services.generation.web_models import model_policy, AUTOMATIC_MODELS
    directory, policy = await model_policy(db, body.platform, 'video' if is_video else 'image', body.requested_model)
    if policy and body.account_id in policy.excluded_account_ids: raise HTTPException(409, '所选账号已排除此型号')
    if body.execution_mode=='browser' and (body.platform, 'video' if is_video else 'image', body.requested_model) not in AUTOMATIC_MODELS:
        raise HTTPException(409, '该网页型号与用途尚未适配自动执行，请选择人工交接')
    if body.execution_mode=='browser' and is_video:
        from app.services.generation.web_models import video_automation_issues
        issues=video_automation_issues(body.reference_mode,body.duration_seconds,body.aspect_ratio,body.resolution,bool(body.source_video_file_id),platform=body.platform)
        if issues: raise HTTPException(409,'；'.join(issues))
    if not is_lab and (slot.generated_video_version_id if is_video else slot.version_id)!=body.expected_version: raise HTTPException(409,'图片槽位已变化，请刷新后提交')
    active=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind.in_(WEB_KINDS),GenerationTask.status.in_(['pending','running'])))
    for item in active:
        old=item.payload.get('web_request',{})
        if {k:v for k,v in old.items() if k not in ['request_id','account_id']}=={k:v for k,v in request.items() if k not in ['request_id','account_id']}:
            raise HTTPException(409,'相同图片任务已在排队或执行')
    snapshots=[]
    for index,file_id in enumerate(body.reference_file_ids):
        reference=MediaReference(file_id=file_id,media_kind='image',ordinal=index)
        snapshots.append(await FileResolver(db).snapshot(reference))
    if is_video and body.source_video_file_id:
        snapshots.append(await FileResolver(db).snapshot(MediaReference(file_id=body.source_video_file_id,media_kind='video',ordinal=len(snapshots))))
    if is_video:
        for group in body.subject_groups:
            for media in group.media:
                snapshots.append(await FileResolver(db).snapshot(MediaReference(file_id=media.file_id,media_kind=media.media_kind,ordinal=len(snapshots))))
    from app.services.generation.web_handoff import reserve_account
    account=await reserve_account(db,body.platform,body.account_id,body.requested_model,'video' if is_video else 'image') if body.execution_mode=='manual' else None
    task=GenerationTask(id=task_id,mode='async_polling',visibility='task_center',task_kind=VIDEO_KIND if is_video else KIND,
        status='running' if account else 'pending',executor_type='manual_handoff' if body.execution_mode=='manual' else 'windows_browser',payload={'web_request':request,'web_stage':'queued','call_identity':{'provider_name':body.platform+'网页','model_name':body.requested_model,'model_identity_source':'requested_web_model','channel':'manual_handoff' if body.execution_mode=='manual' else 'browser'}})
    task.payload={**task.payload,'web_catalog_snapshot':{'revision':directory.revision,'model':policy.model_dump() if policy else {'name':body.requested_model}},'target_file_id':None if is_lab else slot.generated_video_file_id if is_video else slot.file_id}
    if account:
        account.active_task_id=task_id;account.last_assigned_at=web_accounts.now()
        task.started_at=web_accounts.now()
        task.payload={**task.payload,'assigned_account_id':account.id,'web_stage':'handoff_ready'}
    db.add(task)
    await db.flush()
    db.add(GenerationTaskLink(task_id=task_id,resource_type='video' if is_video else 'image',relation_type='experiment_session' if is_lab else 'shot_video_edit' if body.target_type=='shot_edit' else 'shot' if is_video else 'shot_frame_slot' if body.target_type=='frame' else body.target_type+'_image',relation_entity_id=body.entity_id if is_video or is_lab else str(body.slot_id)))
    if is_lab:
        from app.services.studio.experiment_messages import ExperimentMessageDraft,append_experiment_messages
        payload={'web_request':request,'reference_file_ids':body.reference_file_ids,'channel':'web','model_name':body.requested_model}
        await append_experiment_messages(db,session_id=body.entity_id,drafts=[ExperimentMessageDraft(role='user',content=body.prompt,payload=payload),ExperimentMessageDraft(role='task',content='网页生成任务已创建，可在交接页面继续处理。',status=task.status,task_id=task.id,payload=payload)])
    for snapshot in snapshots:
        db.add(GenerationTaskMediaReference(task_id=task_id,file_id=snapshot.file_id,group_path='references',ordinal=snapshot.ordinal,media_kind=snapshot.media_kind,file_content_version=snapshot.file_content_version,file_content_hash=snapshot.file_content_hash))
    await db.flush()
    return read_task(task)


async def claim(db,account_id,claim_token=None,modality="image"):
    """Claim once; expired in-flight tasks require reconciliation, never requeue blindly."""
    if modality not in ['image','video','any']: raise HTTPException(422,'不支持的执行器媒体类型')
    kind=VIDEO_KIND if modality=='video' else KIND
    # Persisted caller capability also recovers a claim whose HTTP response was lost.
    owned=await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.id==account_id))
    if owned and owned.active_task_id:
        task=await get_task(db,owned.active_task_id)
        if task.task_kind not in (WEB_KINDS if modality=='any' else [kind]) or task.executor_type!='windows_browser': return None
        if claim_token and secrets.compare_digest(hashlib.sha256(claim_token.encode()).hexdigest(),task.payload.get('runner_token_hash','')):
            return {'task_id':task.id,'token':claim_token,'request':{**task.payload['web_request'],'account_id':account_id},'status':task.status}
        return None
    # Freeze the chosen identity only when both task and account can be claimed.
    pending=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind.in_(WEB_KINDS if modality=='any' else [kind]),GenerationTask.executor_type=='windows_browser',GenerationTask.status=='pending',GenerationTask.cancel_requested==False).order_by(GenerationTask.created_at).with_for_update(skip_locked=True).limit(100))
    for task in pending:
        request=task.payload['web_request']
        assigned=task.payload.get('dispatch_account_id')
        if assigned and assigned!=account_id:continue
        accounts=await web_accounts.eligible_accounts(db,request['platform'],request['requested_model'],assigned or request.get('account_id'),'video' if task.task_kind==VIDEO_KIND else 'image')
        if not accounts or accounts[0].id!=account_id: continue
        account=accounts[0]
        account.active_task_id=task.id;account.last_assigned_at=web_accounts.now()
        token=claim_token or secrets.token_urlsafe(32)
        task.status='running';task.started_at=web_accounts.now()
        task.lease_expires_at=web_accounts.now()+timedelta(minutes=5)
        task.payload={**task.payload,'web_stage':'preparing','assigned_account_id':account.id,'runner_token_hash':hashlib.sha256(token.encode()).hexdigest()}
        await db.flush()
        return {'task_id':task.id,'token':token,'request':{**request,'account_id':account.id}}
    return None



def check_token(task,token, *, allow_cancelled=False):
    """A task-specific token cannot finalize or alter another task."""
    actual=hashlib.sha256(token.encode()).hexdigest()
    if not secrets.compare_digest(actual,task.payload.get('runner_token_hash','')):
        raise HTTPException(403,'执行器任务凭据无效')
    if not allow_cancelled and (task.cancel_requested or task.status=='cancelled'): raise HTTPException(409,'任务已取消，不再自动回填')


async def report(db,task_id,token,body):
    """Persist a verified platform receipt and a resumable human-intervention stage."""
    task=await get_task(db,task_id,True);check_token(task,token)
    if task.status!='running': raise HTTPException(409,'任务不在执行中')
    if body.recovery_epoch != task.payload.get('recovery_epoch',0):
        raise HTTPException(409,'恢复版本已变化，请重新读取原任务')
    from app.services.generation.web_models import AUTOMATIC_RECEIPTS
    receipt_rules = AUTOMATIC_RECEIPTS.get(task.payload.get('web_request',{}).get('platform','doubao'))
    if (body.conversation_url or body.message_id) and not receipt_rules:
        raise HTTPException(422,'该平台尚未注册自动回执校验')
    if body.conversation_url and not re.fullmatch(receipt_rules[0], body.conversation_url):
        raise HTTPException(422,'只能记录对应平台已核验的官方会话地址')
    if body.message_id and not re.fullmatch(receipt_rules[1], body.message_id):
        raise HTTPException(422,'平台消息编号无效')
    if body.stage=='submitted' and (not body.conversation_url or not body.message_id):
        raise HTTPException(422,'缺少可核对的会话与消息回执')
    remote={'conversation_url':body.conversation_url,'message_id':body.message_id} if body.conversation_url and body.message_id else task.payload.get('remote')
    if remote and remote!=task.payload.get('remote'):
        account_id=task.payload['assigned_account_id']
        await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.id==account_id).with_for_update())
        previous_tasks=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind.in_(WEB_KINDS),GenerationTask.id!=task_id,GenerationTask.payload['assigned_account_id'].as_string()==account_id))
        if any(item.payload.get('remote')==remote for item in previous_tasks): raise HTTPException(409,'这条平台结果已经绑定其他业务任务')
    existing_binding=task.payload.get('web_binding')
    if existing_binding and body.conversation_url and body.conversation_url!=existing_binding['conversation_url']:
        raise HTTPException(409,'结果会话与原任务绑定不一致')
    if body.binding_version==2 and body.user_message_id:
        if not body.conversation_url or not re.fullmatch(receipt_rules[1],body.user_message_id):
            raise HTTPException(422,'缺少有效的原会话与用户消息编号')
        binding={'task_id':task.id,'account_id':task.payload['assigned_account_id'],'conversation_url':body.conversation_url,'user_message_id':body.user_message_id}
        old_binding=task.payload.get('web_binding')
        if old_binding and old_binding!=binding:raise HTTPException(409,'已绑定的任务会话与消息不可更换')
        await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.id==binding['account_id']).with_for_update())
        others=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind.in_(WEB_KINDS),GenerationTask.id!=task.id,GenerationTask.payload['assigned_account_id'].as_string()==binding['account_id']))
        if any((item.payload.get('web_binding') or {}).get('conversation_url')==body.conversation_url for item in others):
            raise HTTPException(409,'独占会话已属于另一任务')
        task.payload={**task.payload,'web_binding':binding}
    previous=task.payload.get('remote')
    if previous and remote!=previous: raise HTTPException(409,'平台回执不能更换到其他会话或消息')
    task.payload={**task.payload,'web_stage':body.stage,'remote':remote,'runner_paused':body.paused or task.payload.get('runner_paused',False)}
    task.error=body.reason;task.heartbeat_at=datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()
    return read_task(task)


async def finish(db,task_id,token,file:UploadFile):
    """Verify actual media; archive once and publish only to its unchanged target.

    A completed HTTP response may be lost. Retrying returns the existing artifact.
    A changed slot leaves the generated image available as history, not overwritten.
    """
    task=await get_task(db,task_id,True);check_token(task,token)
    return await publish_download(db,task,file)


async def finish_many(db,task_id,token,files):
    """Commit one complete candidate set in a database transaction; never auto-select a multi-result slot.

    The task lock and immutable receipt scope every file to the original account/task.
    A lost success response returns the existing set; a partial transaction stays retryable.
    """
    task=await get_task(db,task_id,True);check_token(task,token)
    if task.status=='succeeded':return read_task(task)
    if not 2<=len(files)<=16:raise HTTPException(422,'多结果归档要求2至16个原文件')
    results=[]
    for ordinal,file in enumerate(files):
        result=await publish_download(db,task,file,ordinal=ordinal,candidate_count=len(files),complete=ordinal==len(files)-1)
        results.append(result.result)
    task.result={**results[0],'files':results,'candidate_count':len(results),'requires_adoption':not task.payload['web_request']['target_type'].startswith('lab_')}
    if task.payload['web_request']['target_type'].startswith('lab_'):
        from app.models.experiment_sessions import ExperimentMessage
        message=await db.scalar(select(ExperimentMessage).where(ExperimentMessage.task_id==task.id))
        if message:message.payload={**message.payload,'result':task.result}
    await db.flush()
    return read_task(task)


async def publish_download(db,task,file, *, ordinal=0, candidate_count=1, complete=True):
    """Archive an already authorized task result without changing its frozen ownership."""
    task_id=task.id
    if task.cancel_requested or task.status=='cancelled': raise HTTPException(409,'任务已取消，不自动回填')
    if task.status=='succeeded': return read_task(task)
    if task.status!='running': raise HTTPException(409,'任务不在执行中')
    remote=task.payload.get('remote') or {}
    if not remote.get('message_id'): raise HTTPException(409,'缺少受理回执，不能把任意图片当作生成结果')
    modality='video' if task.task_kind==VIDEO_KIND else 'image'
    limit=(500 if modality=='video' else 25)*1024*1024
    data=await file.read(limit+1)
    if len(data)>limit: raise HTTPException(413,'生成文件超过上传限制')
    metadata=await inspect_media(data,modality)
    body=(WebVideoRequest if modality=='video' else WebImageRequest).model_validate(task.payload['web_request'])
    region_composite=None
    if modality=='image' and body.edit_region:
        from app.services.generation.image_region import composite_region
        from anyio import to_thread
        source,_,_=await frozen_reference_content(db,task,0)
        try:region_composite=await to_thread.run_sync(composite_region,source,data,body.edit_region)
        except ValueError as error:raise HTTPException(422,str(error)) from error
    from starlette.datastructures import Headers
    extension=metadata['extension'];width=metadata['width'];height=metadata['height']
    verified=UploadFile(filename=f'web-{task_id}.{extension}',file=BytesIO(data),headers=Headers({'content-type':metadata['mime']}))
    saved=await upload_file(db,file=verified,name='网页生成'+('视频' if modality=='video' else '图片'))
    saved.width=width;saved.height=height;saved.duration_ms=metadata['duration_ms']
    raw_original_id=None
    if region_composite is not None:
        raw_original_id=saved.id
        db.add(GenerationArtifact(id=uuid5(NAMESPACE_URL,task.id+':raw-original:'+str(ordinal)).hex,task_id=task.id,modality='image',ordinal=candidate_count+ordinal,file_id=saved.id,provider_result={'role':'platform_raw_original','remote':remote,'actual_media':metadata,'content_sha256':hashlib.sha256(data).hexdigest()},publish_status='skipped',publish_error='raw_original_preserved'))
        data=region_composite;metadata=await inspect_media(data,'image')
        width=metadata['width'];height=metadata['height'];extension=metadata['extension']
        saved=await upload_file(db,file=UploadFile(filename=f'web-region-{task_id}.png',file=BytesIO(data),headers=Headers({'content-type':'image/png'})),name='网页局部修正合成结果')
        saved.width=width;saved.height=height
    issues=video_spec_issues(body,metadata) if modality=='video' else []
    is_lab=body.target_type in ['lab_image','lab_video']
    is_edit=body.target_type=='shot_edit'
    if is_lab or is_edit or candidate_count>1:
        changed=None
    elif modality=='video' and issues:
        changed=None
    elif modality=='video':
        changed=await db.execute(update(Shot).where(Shot.id==body.entity_id,Shot.generated_video_version_id==body.expected_version).values(generated_video_file_id=saved.id,generated_video_version_id=Shot.generated_video_version_id+1))
    else:
        model,parent=SLOTS[body.target_type]
        changed=await db.execute(update(model).where(model.id==body.slot_id,getattr(model,parent)==body.entity_id,model.version_id==body.expected_version).values(file_id=saved.id,version_id=model.version_id+1,width=width,height=height,format=extension))
    published=is_lab or bool(changed is not None and changed.rowcount)
    db.add(GenerationArtifact(id=uuid5(NAMESPACE_URL,task.id+':'+modality+':'+str(ordinal)).hex,task_id=task.id,modality=modality,ordinal=ordinal,file_id=saved.id,provider_result={'channel':task.payload['web_request']['platform']+'_web','remote':remote,'account_id':task.payload['assigned_account_id'],'requested_model':body.requested_model,'raw_original_file_id':raw_original_id,'input':body.model_dump(mode='json'),'actual_media':metadata,'spec_issues':issues,'watermark_status':task.payload.get('export_provenance',{}).get('watermark','unknown'),'export_provenance':task.payload.get('export_provenance',{}),'content_sha256':hashlib.sha256(data).hexdigest(),'candidate_count':candidate_count,'publication_rights':'待核对'},publish_status='published' if published else 'skipped' if issues or is_edit or candidate_count>1 else 'conflicted',publish_error=None if published else 'web_video_spec_mismatch' if issues else 'web_edit_requires_adoption' if is_edit else 'multiple_candidates_require_adoption' if candidate_count>1 else 'target_version_conflict'))
    if ordinal==0:await db.execute(update(GenerationTaskLink).where(GenerationTaskLink.task_id==task.id).values(file_id=saved.id))
    task.result={'file_id':saved.id,'published':published,'spec_issues':issues,'watermark_status':task.payload.get('export_provenance',{}).get('watermark','unknown'),'publication_rights':'待核对'}
    if raw_original_id:task.result={**task.result,'source_file_id':body.reference_file_ids[0],'raw_original_file_id':raw_original_id}
    if not complete:
        await db.flush()
        return read_task(task)
    task.status='succeeded';task.progress=100;task.finished_at=datetime.now(timezone.utc).replace(tzinfo=None);task.error=''
    task.payload={**task.payload,'web_stage':'completed'}
    await db.execute(update(WebGenerationAccount).where(WebGenerationAccount.id==task.payload['assigned_account_id'],WebGenerationAccount.active_task_id==task.id).values(active_task_id=None))
    from app.services.generation.web_handoff import dispatch_waiting
    await dispatch_waiting(db,body.platform)
    if is_lab:
        from app.models.experiment_sessions import ExperimentMessage
        message=await db.scalar(select(ExperimentMessage).where(ExperimentMessage.task_id==task.id,ExperimentMessage.session_id==body.entity_id))
        if message:
            message.status='succeeded';message.payload={**message.payload,'result':task.result};message.content='网页生成完成'
    await db.flush()
    return read_task(task)


async def resume(db,task_id,token):
    """Recover exactly the original request; no requeue or credential rotation."""
    task=await get_task(db,task_id,True);check_token(task,token,allow_cancelled=True)
    await settle_cancelled(db,task)
    return {'task_id':task.id,'token':token,'request':{**task.payload['web_request'],'account_id':task.payload['assigned_account_id']},'status':task.status,'remote':task.payload.get('remote'),'paused':task.payload.get('runner_paused',False),'recovery_epoch':task.payload.get('recovery_epoch',0)}


async def request_recovery(db,task_id,body):
    """Explicitly release only a pause; original receipt, account, token and input remain unchanged."""
    task=await get_task(db,task_id,True)
    if task.executor_type!='windows_browser' or task.status!='running' or task.cancel_requested:
        raise HTTPException(409,'仅运行中的原网页任务可恢复')
    epoch=task.payload.get('recovery_epoch',0)
    if body.expected_recovery_epoch!=epoch: raise HTTPException(409,'任务恢复状态已变化，请刷新')
    if not task.payload.get('runner_paused'): raise HTTPException(409,'任务未暂停，无需重复恢复')
    task.payload={**task.payload,'runner_paused':False,'recovery_epoch':epoch+1,'recovery_requested_at':web_accounts.now().isoformat()}
    task.error='已请求恢复原任务；不会重新提交已受理或受理未知的生成'
    await db.flush()
    return read_task(task)


async def reference_content(db,task_id,token,ordinal):
    """Download only the frozen reference at this ordinal, with content drift checks."""
    task=await get_task(db,task_id);check_token(task,token)
    return await frozen_reference_content(db,task,ordinal)


async def frozen_reference_content(db,task,ordinal):
    """Resolve a frozen task reference for either browser execution or a human handoff."""
    task_id=task.id
    request=task.payload['web_request']
    ids=[*request['reference_file_ids']]
    if request.get('source_video_file_id'): ids.append(request['source_video_file_id'])
    kinds=['image']*len(request['reference_file_ids'])+(['video'] if request.get('source_video_file_id') else [])
    for group in request.get('subject_groups',[]):
        for media in group['media']:ids.append(media['file_id']);kinds.append(media['media_kind'])
    if ordinal<0 or ordinal>=len(ids): raise HTTPException(404,'Reference not part of this task')
    result=await FileResolver(db).resolve_task_reference(task_id=task.id,reference=MediaReference(file_id=ids[ordinal],media_kind=kinds[ordinal],ordinal=ordinal))
    frozen=await db.scalar(select(GenerationTaskMediaReference).where(GenerationTaskMediaReference.task_id==task_id,GenerationTaskMediaReference.ordinal==ordinal,GenerationTaskMediaReference.group_path=='references'))
    if frozen and frozen.file_content_hash and frozen.file_content_hash!=hashlib.sha256(result.content).hexdigest(): raise HTTPException(409,'参考图实际内容已经变化，停止发送')
    return result.content,result.content_type or 'application/octet-stream',hashlib.sha256(result.content).hexdigest()

async def target_version(db,target_type,entity_id,slot_id):
    """Expose a slot version only after verifying its owning object."""
    if target_type in ['lab_image','lab_video']:
        from app.models.experiment_sessions import ExperimentSession
        session=await db.get(ExperimentSession,entity_id)
        if not session or session.lab_type!=target_type.removeprefix('lab_'): raise HTTPException(404,'实验室会话不存在')
        return {'version':1,'file_id':None}
    if target_type in ['shot','shot_edit']:
        shot=await db.get(Shot,entity_id)
        if not shot: raise HTTPException(404,'镜头不存在')
        return {'version':shot.generated_video_version_id,'file_id':shot.generated_video_file_id}
    if target_type not in SLOTS: raise HTTPException(422,'不支持的目标类型')
    model,parent=SLOTS[target_type]
    slot=await db.scalar(select(model).where(model.id==slot_id,getattr(model,parent)==entity_id))
    if not slot: raise HTTPException(404,'图片槽位不存在或不属于当前对象')
    return {'version':slot.version_id,'file_id':slot.file_id}
