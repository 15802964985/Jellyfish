"""Local web accounts and capability-aware, least-recently-used scheduling."""
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy import select, case
from app.models.web_generation import WebGenerationAccount
from app.core.contracts.web_generation import WebAccountRead


def now():
    """Use naive UTC consistently with the project's MySQL datetime convention."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


READINESS_TEXT = {
    'disabled': ('账号已停用', '到账号页开启调度后参与自动执行'),
    'unsupported_platform': ('该平台暂无自动执行，仅支持人工交接', '提交时选择人工交接方式'),
    'busy': ('正在处理原任务，完成后自动接续下一任务', '无需操作；可在任务中心查看原任务'),
    'needs_login': ('可提交任务；等待官网登录，登录后自动继续', '提交任务后在本账号窗口完成登录'),
    'needs_verification': ('可提交任务；等待人机验证，完成后自动继续', '在本账号窗口完成验证，原任务自动继续'),
    'limited': ('平台限制待处理', '按官网提示恢复该账号权益'),
    'model_unverified': ('尚未核实该用途的网页模型', '在生成页完成该模型的核验，或到账号页查看已核实模型'),
    'signed_in': ('官网已登录，可提交任务', '所选型号在执行时核实'),
    'runner_offline': ('执行器未运行；提交任务后将自动启动', '无需操作；也可到账号页手动启动'),
    'ready': ('可自动执行', ''),
}
NON_BLOCKING = ('ready', 'runner_offline', 'signed_in', 'needs_login', 'needs_verification', 'busy')


def readiness(row, model=None):
    """Single source of account availability for the accounts page and the generation page.

    Login validity and window state are separate concerns: a stopped executor never means
    an unusable account — task-driven auto-launch (web_desktop.auto_launch) starts it.
    Platform capability comes from the shared AUTO_PLATFORMS registry, never a hardcoded name.
    """
    from app.services.generation.web_models import AUTO_PLATFORMS
    online = bool(row.heartbeat_at and row.heartbeat_at > now()-timedelta(seconds=90))
    if not row.enabled:
        code = 'disabled'
    elif row.platform not in AUTO_PLATFORMS:
        code = 'unsupported_platform'
    elif row.active_task_id:
        code = 'busy'
    elif not online or row.session_state == 'offline':
        # Login/challenge is a resumable wait, not an account submission prohibition.
        code = row.session_state if row.session_state in ('needs_login', 'needs_verification', 'limited') else 'runner_offline'
    elif row.session_state == 'needs_login':
        code = 'needs_login'
    elif row.session_state == 'needs_verification':
        code = 'needs_verification'
    elif row.session_state == 'limited':
        code = 'limited'
    elif row.session_state == 'signed_in':
        code = 'signed_in'
    elif row.session_state == 'ready':
        code = 'ready'
    else:
        code = 'signed_in'
    reason, action = READINESS_TEXT.get(code, (row.session_state or '状态未知', ''))
    if not online and code in ('needs_login', 'needs_verification', 'limited'):
        reason = '上次核验：' + reason + '；启动执行器后自动继续'
    return {'code': code, 'reason': reason, 'action': action, 'blocking': code not in NON_BLOCKING}


def account_read(row):
    """Exclude credentials and distinguish online worker from enabled account."""
    from app.services.generation.web_models import AUTOMATIC_MODELS
    videos=[name for name in row.supported_models or [] if (row.platform,'video',name) in AUTOMATIC_MODELS]
    images=[name for name in row.supported_models or [] if name not in videos]
    return WebAccountRead(id=row.id,display_name=row.display_name,platform=row.platform,enabled=row.enabled,session_state=row.session_state,supported_models=images,supported_video_models=videos,online=bool(row.heartbeat_at and row.heartbeat_at>now()-timedelta(seconds=90)),active_task_id=row.active_task_id,observed_at=row.heartbeat_at.isoformat()+'Z' if row.heartbeat_at else None,readiness=readiness(row))


async def list_accounts(db):
    """List paired and unpaired accounts so users can see why dispatch is waiting."""
    return [account_read(row) for row in await db.scalars(select(WebGenerationAccount).order_by(WebGenerationAccount.created_at))]


async def save_account(db,body,account_id=None):
    """Change alias/enabled state; never release an active task or change its platform."""
    row=await db.get(WebGenerationAccount,account_id) if account_id else None
    if account_id and not row: raise HTTPException(404,'账号不存在')
    if row and row.platform!=body.platform: raise HTTPException(409,'已有账号不能切换平台，请新增独立账号')
    if not body.display_name.strip(): raise HTTPException(422,'账号名称不能为空')
    if not row:
        row=WebGenerationAccount(id=uuid4().hex,platform=body.platform,display_name=body.display_name,enabled=body.enabled)
        db.add(row)
    row.display_name=body.display_name.strip();row.enabled=body.enabled
    await db.flush()
    if row.enabled:
        from app.services.generation.web_handoff import dispatch_waiting
        await dispatch_waiting(db,row.platform)
    return account_read(row)


async def heartbeat(db,account_id,body):
    """Bind a unique local profile once; another profile cannot take over its jobs."""
    row=await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.id==account_id).with_for_update())
    if not row: raise HTTPException(404,'账号不存在')
    if row.profile_key and row.profile_key!=body.profile_key: raise HTTPException(409,'账号已绑定另一个浏览器资料目录')
    other=await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.profile_key==body.profile_key,WebGenerationAccount.id!=account_id))
    if other: raise HTTPException(409,'同一浏览器资料目录不能登记为多个账号')
    from app.services.generation.web_models import AUTO_PLATFORMS
    if body.session_state=='ready' and row.platform not in AUTO_PLATFORMS: raise HTTPException(409,'该平台网页执行尚未验证，不能标记可调度')
    row.profile_key=body.profile_key;row.session_state=body.session_state
    row.supported_models=list(dict.fromkeys(body.supported_models));row.heartbeat_at=now()
    await db.flush()
    return account_read(row)


async def eligible_accounts(db,platform,model,explicit=None,modality='image'):
    """Claim a live isolated worker even while login is pending; execution verifies the exact model.

    Disabled, busy, stale and limited accounts remain excluded; an owned task never switches account.
    """
    query=select(WebGenerationAccount).where(WebGenerationAccount.platform==platform,WebGenerationAccount.enabled==True,WebGenerationAccount.session_state.in_(['ready','signed_in','needs_login','needs_verification']),WebGenerationAccount.active_task_id.is_(None),WebGenerationAccount.heartbeat_at>now()-timedelta(seconds=90))
    if explicit: query=query.where(WebGenerationAccount.id==explicit)
    rows=await db.scalars(query.order_by(case((WebGenerationAccount.session_state.in_(['ready','signed_in']),0),else_=1),WebGenerationAccount.last_assigned_at,WebGenerationAccount.id).with_for_update(skip_locked=True))
    from app.services.generation.web_models import model_policy, AUTOMATIC_MODELS
    if (platform, modality, model) not in AUTOMATIC_MODELS: return []
    try: _, policy = await model_policy(db, platform, modality, model)
    except HTTPException: return []
    return [row for row in rows if not policy or row.id not in policy.excluded_account_ids]

async def model_catalog(db, platform, modality):
    """Delegate catalog policy and evidence to the shared website model service."""
    from app.services.generation.web_models import catalog
    return (await catalog(db, platform, modality)).model_dump()
