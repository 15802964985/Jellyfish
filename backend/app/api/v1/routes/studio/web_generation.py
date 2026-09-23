"""网页生成API只负责鉴权、参数和响应，执行逻辑在service与Windows执行器。"""
from typing import Literal
from pydantic import ValidationError
import os
import secrets
from fastapi import Response, APIRouter, Depends, Header, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.core.contracts.web_generation import WebImageRequest, WebVideoRequest, WebTaskRead, WebRunnerUpdate, WebAccountWrite, WebAccountRead, WebAccountHeartbeat
from app.services.generation import web_generation as service, web_accounts, web_handoff
from app.core.contracts.web_generation import WebHandoffReceipt, WebOfficialExportRequest, WebHandoffProgress, WebUnsentRelease, WebExportAdoption

from app.core.contracts.web_models import WebCatalogRead, WebCatalogWrite, WebExecutionRead
from app.services.generation import web_models
from app.core.contracts.web_generation import WebRecoveryRequest

router=APIRouter()


@router.post('/tasks/{task_id}/recover',response_model=WebTaskRead)
async def recover_original(task_id:str,body:WebRecoveryRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Resume the original paused task explicitly without creating another generation."""
    return await service.request_recovery(db,task_id,body)


def runner_auth(authorization: str = Header(default='')):
    """Disabled until an explicit local runner credential is configured."""
    expected=os.environ.get('WEB_GENERATION_RUNNER_TOKEN','')
    if not expected: raise HTTPException(503,'本机网页执行器尚未配置')
    if not secrets.compare_digest(authorization,'Bearer '+expected): raise HTTPException(403,'执行器认证失败')


@router.post('/images',response_model=WebTaskRead,status_code=202)
async def submit_image(body:WebImageRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Accept an explicit browser image request without waiting for generation."""
    if body.execution_mode!='browser': raise HTTPException(422,'人工交接请使用对应交接入口')
    if not os.environ.get('WEB_GENERATION_RUNNER_TOKEN'): raise HTTPException(503,'网页通道尚在验证，未启用')
    return await service.submit(db,body)


@router.post('/videos',response_model=WebTaskRead,status_code=202)
async def submit_video(body:WebVideoRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Accept a frozen browser video job; no model call runs inside the HTTP request."""
    if body.execution_mode!='browser': raise HTTPException(422,'人工交接请使用对应入口')
    if not os.environ.get('WEB_GENERATION_RUNNER_TOKEN'): raise HTTPException(503,'本机执行器尚未配置')
    return await service.submit(db,body)


@router.post('/runner/claim',dependencies=[Depends(runner_auth)],response_model=dict|None)
async def claim(x_web_account:str=Header(),x_claim_token:str=Header(min_length=32,max_length=128),x_web_modality:Literal['image','video','any']=Header(default='image'),db:AsyncSession=Depends(get_db,scope='function')):
    """Let the local executor claim one persisted pending task."""
    return await service.claim(db,x_web_account,x_claim_token,x_web_modality)


@router.get('/tasks/{task_id}',response_model=WebTaskRead)
async def read(task_id:str,db:AsyncSession=Depends(get_db,scope='function')):
    """Restore the browser task's status after navigation or refresh."""
    return service.read_task(await service.get_task(db,task_id))


@router.post('/tasks/{task_id}/stage',dependencies=[Depends(runner_auth)],response_model=WebTaskRead)
async def report(task_id:str,body:WebRunnerUpdate,x_task_token:str=Header(),db:AsyncSession=Depends(get_db,scope='function')):
    """Record a platform receipt or request user intervention."""
    return await service.report(db,task_id,x_task_token,body)


@router.post('/tasks/{task_id}/result',dependencies=[Depends(runner_auth)],response_model=WebTaskRead)
async def result(task_id:str,x_task_token:str=Header(),file:UploadFile=File(),db:AsyncSession=Depends(get_db,scope='function')):
    """Archive the downloaded image and safely publish to its frozen target."""
    return await service.finish(db,task_id,x_task_token,file)

@router.post('/tasks/{task_id}/results',dependencies=[Depends(runner_auth)],response_model=WebTaskRead)
async def results(task_id:str,x_task_token:str=Header(),files:list[UploadFile]=File(),db:AsyncSession=Depends(get_db,scope='function')):
    """Accept all originals from the same task receipt in one transactional publication."""
    return await service.finish_many(db,task_id,x_task_token,files)

@router.get('/accounts',response_model=list[WebAccountRead])
async def accounts(db:AsyncSession=Depends(get_db,scope='function')):
    """Account management uses safe aliases and actual runner availability."""
    return await web_accounts.list_accounts(db)


@router.post('/accounts',response_model=WebAccountRead,status_code=201)
async def create_account(body:WebAccountWrite,db:AsyncSession=Depends(get_db,scope='function')):
    """Create an unpaired identity; this does not sign in or purchase anything."""
    return await web_accounts.save_account(db,body)


@router.patch('/accounts/{account_id}',response_model=WebAccountRead)
async def update_account(account_id:str,body:WebAccountWrite,db:AsyncSession=Depends(get_db,scope='function')):
    """Enable/disable future dispatch without reassigning active tasks."""
    return await web_accounts.save_account(db,body,account_id)


@router.post('/accounts/{account_id}/heartbeat',dependencies=[Depends(runner_auth)],response_model=WebAccountRead)
async def account_heartbeat(account_id:str,body:WebAccountHeartbeat,db:AsyncSession=Depends(get_db,scope='function')):
    """Only the trusted local worker can attest login and exact supported model."""
    return await web_accounts.heartbeat(db,account_id,body)


@router.post('/tasks/{task_id}/resume',dependencies=[Depends(runner_auth)],response_model=dict)
async def resume(task_id:str,x_task_token:str=Header(),db:AsyncSession=Depends(get_db,scope='function')):
    """Restore the same binding using its locally persisted task credential."""
    return await service.resume(db,task_id,x_task_token)


@router.get('/tasks/{task_id}/references/{ordinal}',dependencies=[Depends(runner_auth)],response_class=Response)
async def reference(task_id:str,ordinal:int,x_task_token:str=Header(),db:AsyncSession=Depends(get_db,scope='function')):
    """Transfer frozen media to the Windows worker without exposing storage keys."""
    content,mime,sha=await service.reference_content(db,task_id,x_task_token,ordinal)
    return Response(content,media_type=mime,headers={'X-Content-SHA256':sha})


@router.get('/targets/{target_type}/{entity_id}/{slot_id}',response_model=dict)
async def target(target_type:str,entity_id:str,slot_id:int,db:AsyncSession=Depends(get_db,scope='function')):
    """Read the current version immediately before freezing a web generation request."""
    return await service.target_version(db,target_type,entity_id,slot_id)

@router.get('/platforms',response_model=dict)
async def platforms():
    """Expose channel-specific verification states instead of implying all accounts can run."""
    from app.core.contracts.web_platforms import WEB_PLATFORMS
    return WEB_PLATFORMS


@router.post('/handoff/images',response_model=WebTaskRead,status_code=202)
async def handoff_image(body:WebImageRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Prepare a frozen manual task; this endpoint never operates a platform website."""
    if body.execution_mode!='manual':raise HTTPException(422,'请选择人工交接模式')
    return await service.submit(db,body)


@router.post('/handoff/videos',response_model=WebTaskRead,status_code=202)
async def handoff_video(body:WebVideoRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Prepare a manual video handoff independently of the unverified browser video adapter."""
    if body.execution_mode!='manual':raise HTTPException(422,'请选择人工交接模式')
    return await service.submit(db,body)


@router.get('/handoff/jobs',response_model=list[dict])
async def handoff_jobs(target_type:str|None=None,entity_id:str|None=None,slot_id:int|None=None,db:AsyncSession=Depends(get_db,scope='function')):
    """List recent recoverable handoffs without loading their prompts into task center."""
    return await web_handoff.list_jobs(db,target_type=target_type,entity_id=entity_id,slot_id=slot_id)


@router.get('/tasks/{task_id}/handoff',response_model=dict)
async def handoff_manifest(task_id:str,db:AsyncSession=Depends(get_db,scope='function')):
    """Expose only frozen business inputs and safe account aliases."""
    return await web_handoff.manifest(db,task_id)


@router.post('/tasks/{task_id}/handoff-progress',response_model=WebTaskRead)
async def handoff_progress(task_id:str,body:WebHandoffProgress,db:AsyncSession=Depends(get_db,scope='function')):
    """Persist a manual platform submission without fabricating success."""
    return await web_handoff.progress(db,task_id,body)


@router.post('/tasks/{task_id}/handoff-result',response_model=WebTaskRead)
async def handoff_result(task_id:str,receipt_json:str=Form(),file:UploadFile=File(),db:AsyncSession=Depends(get_db,scope='function')):
    """Validate the declared receipt and archive the original media in one transaction."""
    return await web_handoff.result(db,task_id,parse_receipt(WebHandoffReceipt,receipt_json),file)


@router.post('/tasks/{task_id}/release-unsent',response_model=WebTaskRead)
async def release_unsent(task_id:str,body:WebUnsentRelease,db:AsyncSession=Depends(get_db,scope='function')):
    """Release only a manually confirmed unsent handoff and its account reservation."""
    return await web_handoff.release_unsent(db,task_id)


@router.post('/tasks/{task_id}/official-export',response_model=dict)
async def official_export(task_id:str,receipt_json:str=Form(),file:UploadFile=File(),db:AsyncSession=Depends(get_db,scope='function')):
    """Import an official clean download while preserving the originally generated file."""
    return await web_handoff.official_export(db,task_id,parse_receipt(WebOfficialExportRequest,receipt_json),file)


@router.get('/tasks/{task_id}/artifacts',response_model=list[dict])
async def web_artifacts(task_id:str,db:AsyncSession=Depends(get_db,scope='function')):
    """Show original and official-export variants in the business workbench."""
    return await web_handoff.artifacts(db,task_id)


def parse_receipt(model,value):
    """Multipart receipt uses explicit JSON to avoid ambiguous nested form-model parsing."""
    try:return model.model_validate_json(value)
    except ValidationError as error:
        raise HTTPException(422,[{'loc':list(item['loc']),'msg':item['msg'],'type':item['type']} for item in error.errors()]) from error


@router.get('/tasks/{task_id}/handoff-references/{ordinal}',response_class=Response)
async def handoff_reference(task_id:str,ordinal:int,download:bool=False,db:AsyncSession=Depends(get_db,scope='function')):
    """Download version-checked frozen references; never serve a silently changed input."""
    task=await service.get_task(db,task_id)
    data,mime,sha=await service.frozen_reference_content(db,task,ordinal)
    extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav'}.get(mime,'bin')
    disposition='attachment' if download else 'inline'
    return Response(data,media_type=mime,headers={'X-Content-SHA256':sha,'Content-Disposition':f'{disposition}; filename="reference-{ordinal+1}.{extension}"'})


@router.post('/tasks/{task_id}/artifacts/{artifact_id}/adopt',response_model=dict)
async def adopt_web_export(task_id:str,artifact_id:str,body:WebExportAdoption,db:AsyncSession=Depends(get_db,scope='function')):
    """Explicitly use an official export only if its own original is still selected."""
    return await web_handoff.adopt_export(db,task_id,artifact_id,body)


@router.get('/platforms/{platform}/models/{modality}',response_model=WebCatalogRead)
async def platform_models(platform:str,modality:str,db:AsyncSession=Depends(get_db,scope='function')):
    """Return website model choices with provenance separately from API provider models."""
    from app.services.generation.web_accounts import model_catalog
    return await model_catalog(db,platform,modality)


from app.core.contracts.web_generation import WebBatchRequest

@router.post('/batch',response_model=list[WebTaskRead],status_code=202)
async def browser_batch(body:WebBatchRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Queue each frozen browser item atomically; mixed execution modes cannot leak into the queue."""
    if any(item.execution_mode!='browser' for item in body.items): raise HTTPException(422,'自动批次不能混入人工交接')
    if not os.environ.get('WEB_GENERATION_RUNNER_TOKEN'): raise HTTPException(503,'本机执行器尚未配置')
    return [await service.submit(db,item) for item in sorted(body.items,key=lambda x:(x.target_type,x.entity_id,getattr(x,'slot_id',0) or 0))]


@router.post('/handoff/batch',response_model=list[WebTaskRead],status_code=202)
async def handoff_batch(body:WebBatchRequest,db:AsyncSession=Depends(get_db,scope='function')):
    """Accept one transaction; each result remains bound to its own target and request ID."""
    if any(item.execution_mode!='manual' for item in body.items):raise HTTPException(422,'批量交接仅支持人工模式')
    return [await service.submit(db,item) for item in sorted(body.items,key=lambda x:(x.target_type,x.entity_id,getattr(x,'slot_id',0) or 0))]


from app.core.contracts.web_generation import WebDesktopLaunch,WebDesktopStatus,WebDesktopCommand,WebDesktopPoll
from app.services.generation import web_desktop

@router.get('/desktop/status',response_model=WebDesktopStatus)
async def desktop_status(db:AsyncSession=Depends(get_db,scope='function')):
    """Display helper status; fetching it never opens a browser."""
    return await web_desktop.status(db)

@router.post('/accounts/{account_id}/desktop',response_model=WebDesktopCommand,status_code=202)
async def desktop_launch(account_id:str,body:WebDesktopLaunch,db:AsyncSession=Depends(get_db,scope='function')):
    """Queue an explicit account operation and return immediately."""
    return await web_desktop.launch(db,account_id,body)

@router.post('/desktop/poll',response_model=list[WebDesktopCommand],dependencies=[Depends(runner_auth)])
async def desktop_poll(body:WebDesktopPoll,db:AsyncSession=Depends(get_db,scope='function')):
    """Authenticated Windows helper pulls commands; no inbound host port is exposed."""
    return await web_desktop.poll(db,body)


@router.put('/platforms/{platform}/models/{modality}', response_model=WebCatalogRead)
async def save_platform_models(platform: str, modality: Literal['image','video'], body: WebCatalogWrite, db: AsyncSession=Depends(get_db,scope='function')):
    """Persist explicit operator policy without altering website or API accounts."""
    return await web_models.save_catalog(db, platform, modality, body)


@router.get('/execution-status', response_model=WebExecutionRead)
async def execution_status(platform: str, modality: Literal['image','video'], model: str='', account_id: str|None=None, batch: bool=False, local_edit: bool=False, reference_mode: str|None=None, duration_seconds: int|None=None, aspect_ratio: str|None=None, resolution: str|None=None, source_video: bool=False, db: AsyncSession=Depends(get_db,scope='function')):
    """Return live reasons for a disabled executor without launching or generating."""
    return await web_models.execution_status(db, platform, modality, model, account_id, batch, local_edit, reference_mode,duration_seconds,aspect_ratio,resolution,source_video)
