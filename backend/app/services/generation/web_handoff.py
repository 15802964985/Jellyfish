"""Manual platform handoff and official-original imports, with immutable business binding."""
import hashlib
import json
from io import BytesIO
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, uuid5
from fastapi import HTTPException, UploadFile
from sqlalchemy import select, update
from starlette.datastructures import Headers
from app.models.web_generation import WebGenerationAccount
from app.models.task import GenerationTask
from app.models.generation_artifacts import GenerationArtifact
from app.models.task_links import GenerationTaskLink
from app.core.contracts.web_platforms import WEB_PLATFORMS
from app.services.generation.web_media import inspect_media
from app.services.generation import web_accounts

# Exact hosts: never accept a lookalike suffix, embedded credentials, or a local URL.
PLATFORM_HOSTS={
    'doubao':{'www.doubao.com'}, 'jimeng':{'jimeng.jianying.com'},
    'kling':{'app.klingai.com','klingai.com'}, 'wanxiang':{'tongyi.aliyun.com'},
    'yuanbao':{'yuanbao.tencent.com'}, 'hailuo':{'hailuoai.com','www.hailuoai.com'},
    'zhipu':{'chatglm.cn','www.chatglm.cn'},
}


def verify_url(platform,url):
    """Validate declared provenance only; never fetch user-provided result URLs."""
    try:
        parsed=urlsplit(url)
        if parsed.scheme!='https' or parsed.hostname not in PLATFORM_HOSTS[platform] or parsed.username or parsed.password or parsed.port not in [None,443] or not parsed.path.strip('/'):
            raise ValueError('Not an official result page')
    except (ValueError,KeyError) as error:
        raise HTTPException(422,'请填写对应平台官方结果页面地址；地区站点不能混用') from error
    return url


def input_fingerprint(task):
    """Fingerprint includes the assigned account and every frozen input, including reference order."""
    data={'request':task.payload['web_request'],'account_id':task.payload.get('assigned_account_id')}
    return hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


async def reserve_account(db,platform,explicit=None,model=None,modality='image'):
    """Reserve one idle enabled account for manual handoff; do not claim verified login status."""
    query=select(WebGenerationAccount).where(WebGenerationAccount.platform==platform,WebGenerationAccount.enabled==True,WebGenerationAccount.session_state.notin_(['limited','needs_verification']))
    if model:
        from app.services.generation.web_models import model_policy
        _, policy = await model_policy(db,platform,modality,model)
        if policy and policy.excluded_account_ids: query=query.where(WebGenerationAccount.id.notin_(policy.excluded_account_ids))
    if explicit:query=query.where(WebGenerationAccount.id==explicit)
    if not await db.scalar(query.limit(1)):raise HTTPException(409,'没有可分配的网页账号，请先登记或恢复账号')
    row=await db.scalar(query.where(WebGenerationAccount.active_task_id.is_(None)).order_by(WebGenerationAccount.last_assigned_at,WebGenerationAccount.id).with_for_update(skip_locked=True).limit(1))
    return row


async def manual_task(db,task_id,lock=False):
    """Browser-owned tasks cannot be completed through an unverified manual shortcut."""
    from app.services.generation import web_generation as web
    task=await web.get_task(db,task_id,lock)
    if task.executor_type!='manual_handoff':raise HTTPException(409,'该任务由浏览器执行器处理，不能改为人工回填')
    return task


async def manifest(db,task_id):
    """Restore the frozen business handoff after navigation, without a platform request."""
    from app.services.generation.web_generation import get_task
    task=await get_task(db,task_id)
    assigned=task.payload.get('assigned_account_id') or task.payload.get('dispatch_account_id')
    account=await db.get(WebGenerationAccount,assigned) if assigned else None
    return {'task_id':task.id,'status':task.status,'stage':task.payload['web_stage'],
            'request':task.payload['web_request'],'input_fingerprint':input_fingerprint(task),
            'account_id':account.id if account else None,'account_name':account.display_name if account else '等待分配','manual':task.executor_type=='manual_handoff',
            'platform':WEB_PLATFORMS[task.payload['web_request']['platform']], 'remote':task.payload.get('remote'),
            'result':task.result,'error':task.error or '',
            'paused':task.payload.get('runner_paused',False),'recovery_epoch':task.payload.get('recovery_epoch',0),
            'can_import_original':task.executor_type=='windows_browser' and task.status=='running' and not task.cancel_requested and task.payload.get('runner_paused',False) and bool(task.payload.get('remote'))}


async def list_jobs(db,limit=30,*,target_type=None,entity_id=None,slot_id=None):
    """List lightweight jobs with recoverable business workbench links."""
    query=select(GenerationTask).where(GenerationTask.executor_type.in_(['manual_handoff','windows_browser']))
    if target_type is not None:query=query.where(GenerationTask.payload['web_request']['target_type'].as_string()==target_type)
    if entity_id is not None:query=query.where(GenerationTask.payload['web_request']['entity_id'].as_string()==entity_id)
    if slot_id is not None:query=query.where(GenerationTask.payload['web_request']['slot_id'].as_integer()==slot_id)
    rows=await db.scalars(query.order_by(GenerationTask.created_at.desc()).limit(limit))
    return [{'task_id':row.id,'platform':row.payload['web_request']['platform'],'model':row.payload['web_request']['requested_model'],
             'target_type':row.payload['web_request']['target_type'],'entity_id':row.payload['web_request']['entity_id'],
             'status':row.status,'stage':row.payload['web_stage'],'slot_id':row.payload['web_request'].get('slot_id'),'candidate_count':(row.result or {}).get('candidate_count',0),'created_at':row.created_at.isoformat()+'Z'} for row in rows]


async def result(db,task_id,receipt,file):
    """Require an explicit same-account/input/result attestation, then reuse safe publication."""
    from app.services.generation import web_generation as web
    task=await web.get_task(db,task_id,True)
    if task.executor_type!='manual_handoff':
        if task.executor_type!='windows_browser' or not task.payload.get('runner_paused') or not task.payload.get('remote'):
            raise HTTPException(409,'自动任务仅在已绑定原结果且持久暂停时允许人工回填')
    if receipt.input_fingerprint!=input_fingerprint(task):raise HTTPException(409,'交接材料已不匹配，请重新打开原任务')
    request=task.payload['web_request']
    verify_url(request['platform'],receipt.conversation_url)
    if receipt.observed_model.strip()!=request['requested_model'].strip():raise HTTPException(409,'官网实际模型与交接任务不一致，不能混用结果')
    remote={'conversation_url':receipt.conversation_url,'message_id':receipt.message_id}
    previous=task.payload.get('remote')
    if previous and previous!=remote:raise HTTPException(409,'已绑定的官网结果不能更换')
    if task.status=='succeeded':return web.read_task(task)
    if task.cancel_requested or task.status!='running':raise HTTPException(409,'任务已停止，不再自动回填')
    account_id=task.payload['assigned_account_id']
    account=await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.id==account_id).with_for_update())
    if not account or account.active_task_id!=task.id:raise HTTPException(409,'原任务已不再持有账号，不能回填')
    others=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind.in_(web.WEB_KINDS),GenerationTask.id!=task.id,GenerationTask.payload['assigned_account_id'].as_string()==account_id))
    if any(remote_identity(row.payload.get('remote'))==remote_identity(remote) for row in others):raise HTTPException(409,'官网结果已绑定其他任务')
    task.payload={**task.payload,'remote':remote,'export_provenance':{'verification':'user_attested','watermark':receipt.watermark,'evidence':receipt.export_evidence,'observed_model':receipt.observed_model,'ai_origin':'platform_generated','checked_at':web_accounts.now().isoformat()+'Z'}}
    return await web.publish_download(db,task,file)


async def release_unsent(db,task_id):
    """Explicitly abandon an unsent handoff; never release a browser-owned or received result."""
    task=await manual_task(db,task_id,True)
    if task.payload.get('remote') or task.payload.get('manual_submission_started') or task.status=='succeeded':raise HTTPException(409,'已有结果不能按未提交任务释放')
    if task.payload.get('web_stage') not in ['queued','handoff_ready','cancelled_unsent']:raise HTTPException(409,'任务阶段不允许按未提交释放')
    task.status='cancelled';task.cancel_requested=True;task.finished_at=web_accounts.now()
    task.payload={**task.payload,'web_stage':'cancelled_unsent','release_reason':'user_confirmed_not_submitted'}
    await db.execute(update(WebGenerationAccount).where(WebGenerationAccount.id==task.payload.get('assigned_account_id'),WebGenerationAccount.active_task_id==task.id).values(active_task_id=None))
    await dispatch_waiting(db,task.payload['web_request']['platform'])
    await db.flush()
    from app.services.generation.web_generation import read_task
    return read_task(task)


async def official_export(db,task_id,body,file):
    """Preserve an original and import an official clean export as a separate historical artifact.

    No cropping, inpainting, metadata stripping, remote fetching or platform purchase occurs.
    The original business selection stays intact; the new file is available for explicit use.
    """
    from app.services.generation import web_generation as web
    task=await web.get_task(db,task_id,True)
    if task.status!='succeeded':raise HTTPException(409,'请先完成原结果归档')
    if task.payload['web_request'].get('edit_region'):raise HTTPException(409,'局部修正结果经过本地合成，不能直接用官网整图替换；原文件可独立下载')
    remote=task.payload.get('remote') or {}
    if remote!={'conversation_url':body.conversation_url,'message_id':body.message_id}:raise HTTPException(409,'无水印导出必须来自原任务同一条官网结果')
    verify_url(task.payload['web_request']['platform'],body.conversation_url)
    if not body.export_evidence.strip():raise HTTPException(422,'请填写官方导出依据')
    source=await db.scalar(select(GenerationArtifact).where(GenerationArtifact.task_id==task.id,GenerationArtifact.file_id==body.source_file_id))
    if not source:raise HTTPException(409,'原文件不属于本次生成任务')
    modality=source.modality;limit=(500 if modality=='video' else 25)*1024*1024
    data=await file.read(limit+1)
    if len(data)>limit:raise HTTPException(413,'文件超过上传限制')
    sha=hashlib.sha256(data).hexdigest();identity=uuid5(NAMESPACE_URL,'web-export:'+body.request_id).hex
    previous=await db.get(GenerationArtifact,identity)
    if previous:
        if previous.task_id!=task.id or previous.provider_result.get('content_sha256')!=sha or previous.provider_result.get('export_request')!=body.model_dump():raise HTTPException(409,'导出请求编号已用于其他内容')
        return {'file_id':previous.file_id,'artifact_id':previous.id,'published':False}
    if source.provider_result.get('watermark_status')=='visible' and source.provider_result.get('content_sha256')==sha:raise HTTPException(422,'上传内容与带水印原文件完全相同，请使用官网实际无水印导出')
    metadata=await inspect_media(data,modality)
    original=source.provider_result.get('actual_media',{})
    if original.get('width') and (metadata['width']<original['width'] or metadata['height']<original['height']):raise HTTPException(422,'导出尺寸小于原文件，可能是缩略图，请下载官网原文件')
    if original.get('duration_ms') and abs(metadata['duration_ms']-original['duration_ms'])>500:raise HTTPException(422,'新导出时长与原结果不一致，请核对是否同一条视频')
    if original.get('width') and abs(metadata['width']/metadata['height']-original['width']/original['height'])>0.03:raise HTTPException(422,'新导出画幅与原结果不一致')
    saved=await web.upload_file(db,file=UploadFile(filename=f'official-{identity}.{metadata["extension"]}',file=BytesIO(data),headers=Headers({'content-type':metadata['mime']})),name='官方无水印导出（人工核对）')
    saved.width=metadata['width'];saved.height=metadata['height'];saved.duration_ms=metadata['duration_ms']
    artifacts=list(await db.scalars(select(GenerationArtifact).where(GenerationArtifact.task_id==task.id)))
    db.add(GenerationArtifact(id=identity,task_id=task.id,modality=modality,ordinal=max(row.ordinal for row in artifacts)+1,file_id=saved.id,provider_result={'channel':task.payload['web_request']['platform']+'_web','remote':remote,'source_file_id':source.file_id,'actual_media':metadata,'content_sha256':sha,'watermark_status':'official_clean','verification':'user_attested','export_request':body.model_dump(),'publication_rights':'待核对','ai_origin':'platform_generated'},publish_status='skipped',publish_error='official_export_requires_adoption'))
    db.add(GenerationTaskLink(task_id=task.id,resource_type=modality,relation_type='web_official_export',relation_entity_id=identity,file_id=saved.id))
    await db.flush()
    return {'file_id':saved.id,'artifact_id':identity,'published':False}


async def artifacts(db,task_id):
    """Return originals and official-export variants without implying public-use clearance."""
    from app.services.generation.web_generation import get_task
    await get_task(db,task_id)
    rows=await db.scalars(select(GenerationArtifact).where(GenerationArtifact.task_id==task_id).order_by(GenerationArtifact.ordinal))
    return [{'artifact_id':row.id,'file_id':row.file_id,'role':row.provider_result.get('role'),'raw_original_file_id':row.provider_result.get('raw_original_file_id'),'modality':row.modality,'published':row.publish_status=='published','watermark':row.provider_result.get('watermark_status','unknown'),'source_file_id':row.provider_result.get('source_file_id'),'verification':row.provider_result.get('verification',row.provider_result.get('export_provenance',{}).get('verification','unverified'))} for row in rows]


async def progress(db,task_id,body):
    """Once a handoff was submitted, preserve its account even while the platform is unclear."""
    task=await manual_task(db,task_id,True)
    if task.status!='running' or task.cancel_requested:raise HTTPException(409,'任务已停止')
    if body.input_fingerprint!=input_fingerprint(task):raise HTTPException(409,'交接材料不匹配')
    task.payload={**task.payload,'web_stage':body.stage,'manual_submission_started':True}
    await db.flush()
    from app.services.generation.web_generation import read_task
    return read_task(task)


async def adopt_export(db,task_id,artifact_id,body):
    """Explicit CAS replacement only while the original file remains selected in its source target."""
    from app.services.generation import web_generation as web
    from app.models.studio_shots import Shot
    task=await web.get_task(db,task_id,True)
    artifact=await db.get(GenerationArtifact,artifact_id)
    if not artifact or artifact.task_id!=task.id or (not artifact.provider_result.get('source_file_id') and task.payload['web_request']['target_type']!='shot_edit' and artifact.provider_result.get('candidate_count',1)<=1):raise HTTPException(404,'该官方导出版本不属于当前任务')
    explicit_candidate=artifact.provider_result.get('candidate_count',1)>1 and 'expected_current_file_id' in body.model_fields_set
    if not explicit_candidate and artifact.provider_result.get('candidate_count',1)>1 and body.expected_version!=task.payload['web_request']['expected_version']:
        raise HTTPException(409,'原业务版本已变化，请回原业务核对候选，不能覆盖新选择')
    request=task.payload['web_request'];source_id=artifact.provider_result.get('source_file_id') or task.payload.get('target_file_id')
    if explicit_candidate:source_id=body.expected_current_file_id
    if not explicit_candidate and request['target_type']=='shot_edit' and not artifact.provider_result.get('source_file_id') and body.expected_version!=request['expected_version']:
        raise HTTPException(409,'编辑期间镜头采用版本已变化，未覆盖当前视频')
    if request['target_type'] in ['lab_image','lab_video']:
        raise HTTPException(409,'实验室导出文件独立保留，请下载使用；不覆盖原消息结果')
    if artifact.provider_result.get('spec_issues'): raise HTTPException(409,'结果规格与请求不匹配，请核对文件后再处理')
    if request['target_type'] in ['shot','shot_edit']:
        target=await db.get(Shot,request['entity_id'])
        if target and target.generated_video_file_id==artifact.file_id:return {'file_id':artifact.file_id,'published':True}
        changed=await db.execute(update(Shot).where(Shot.id==request['entity_id'],Shot.generated_video_file_id==source_id,Shot.generated_video_version_id==body.expected_version).values(generated_video_file_id=artifact.file_id,generated_video_version_id=Shot.generated_video_version_id+1))
    else:
        model,parent=web.SLOTS[request['target_type']]
        target=await db.scalar(select(model).where(model.id==request['slot_id'],getattr(model,parent)==request['entity_id']))
        if target and target.file_id==artifact.file_id:return {'file_id':artifact.file_id,'published':True}
        metadata=artifact.provider_result['actual_media']
        changed=await db.execute(update(model).where(model.id==request['slot_id'],getattr(model,parent)==request['entity_id'],model.file_id==source_id,model.version_id==body.expected_version).values(file_id=artifact.file_id,version_id=model.version_id+1,width=metadata['width'],height=metadata['height'],format=metadata['extension']))
    if not changed.rowcount:raise HTTPException(409,'当前业务已选择其他版本，未覆盖；导出文件仍保留可下载')
    artifact.publish_status='published';artifact.publish_error=None
    await db.flush()
    return {'file_id':artifact.file_id,'published':True}


def remote_identity(remote):
    """Ignore URL tracking fragments when detecting reuse of the same declared platform result."""
    if not remote:return None
    parsed=urlsplit(remote.get('conversation_url',''))
    return (parsed.hostname,parsed.path.rstrip('/'),remote.get('message_id'))


async def dispatch_waiting(db,platform):
    """Assign queued handoffs only after a known completion/release; never steal an uncertain account."""
    tasks=await db.scalars(select(GenerationTask).where(GenerationTask.executor_type=='manual_handoff',GenerationTask.status=='pending',GenerationTask.cancel_requested==False).order_by(GenerationTask.created_at,GenerationTask.id).with_for_update(skip_locked=True))
    for task in tasks:
        request=task.payload.get('web_request',{})
        if request.get('platform')!=platform:continue
        try: account=await reserve_account(db,platform,request.get('account_id'),request.get('requested_model'),'video' if task.task_kind=='web_video_generation' else 'image')
        except HTTPException:continue
        if not account:continue
        account.active_task_id=task.id;account.last_assigned_at=web_accounts.now()
        task.status='running';task.started_at=web_accounts.now()
        task.payload={**task.payload,'assigned_account_id':account.id,'web_stage':'handoff_ready'}
    await db.flush()
