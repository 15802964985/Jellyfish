"""Editable website catalogs and conservative executor gating, independent from API models."""
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from app.models.web_generation import WebGenerationAccount, WebModelCatalog
from app.models.task import GenerationTask
from app.core.contracts.web_platforms import WEB_PLATFORMS, WEB_MODEL_EVIDENCE
from app.core.contracts.web_models import WebCatalogRead, WebModelEvidence, WebExecutionRead
from app.services.generation.web_accounts import now

# This is the verified adapter boundary, not a free-model list or an editable user policy.
AUTOMATIC_MODELS = {('doubao', 'image', 'Seedream 4.5'), ('doubao', 'video', 'Seedance 2.0 Mini'), ('doubao', 'video', 'Seedance 2.0 Fast')}
# Single platform-capability registry: adding a platform here (plus a worker adapter) enables
# it across readiness, execution status, manual launch and task-driven auto-launch.
AUTO_PLATFORMS = {platform for platform, _, _ in AUTOMATIC_MODELS}
AUTOMATIC_RECEIPTS = {
    'doubao': (r'https://www\.doubao\.com/chat/[0-9]+', r'[0-9]+'),
}


def scope_key(platform, modality):
    """Only registered website platforms and concrete media types may store policy."""
    if platform not in WEB_PLATFORMS or modality not in ('image', 'video'):
        raise HTTPException(422, '平台或媒体类型不支持')
    return platform + ':' + modality


async def catalog(db, platform, modality):
    """Merge defaults, observed image models, successful receipts and authoritative operator policy."""
    key = scope_key(platform, modality)
    entries = {item['name']: WebModelEvidence(name=item['name'], source=item['source'], note=item.get('note',''))
        for item in WEB_MODEL_EVIDENCE.get(platform, {}).get(modality, [])}
    if platform in AUTO_PLATFORMS:
        accounts = await db.scalars(select(WebGenerationAccount).where(WebGenerationAccount.platform==platform))
        for account in accounts:
            for name in account.supported_models or []:
                if (platform,modality,name) not in AUTOMATIC_MODELS: continue
                observed = account.heartbeat_at.isoformat()+'Z' if account.heartbeat_at else None
                entries[name] = WebModelEvidence(name=name, source='runner_observed', observed_at=observed,
                    note='执行器曾观察到；当前在线和登录状态另行检查')
    rows = await db.scalars(select(GenerationTask).where(GenerationTask.task_kind=='web_'+modality+'_generation',
        GenerationTask.status=='succeeded').order_by(GenerationTask.created_at.desc()).limit(200))
    for task in rows:
        request = task.payload.get('web_request', {})
        name = request.get('requested_model', '').strip()
        if request.get('platform')==platform and name and name not in entries:
            entries[name] = WebModelEvidence(name=name, source='successful_receipt',
                observed_at=task.created_at.isoformat()+'Z', note='历史成功，不代表当前账号权限或免费额度')
    row = await db.get(WebModelCatalog, key)
    if row:
        for item in row.entries:
            prior = next((value for name,value in entries.items() if name.casefold()==item['name'].casefold()), None)
            entries = {name:value for name,value in entries.items() if name.casefold()!=item['name'].casefold()}
            entries[item['name']] = WebModelEvidence(**item, source='maintained', observed_at=prior.observed_at if prior else None)
    for entry in entries.values():
        entry.automatic_supported = (platform, modality, entry.name) in AUTOMATIC_MODELS
    return WebCatalogRead(revision=row.revision if row else 0, models=list(entries.values()))


async def save_catalog(db, platform, modality, body):
    """CAS a policy revision; omitted/renamed entries become disabled tombstones, preserving old tasks."""
    key = scope_key(platform, modality)
    current = await catalog(db, platform, modality)
    if current.revision != body.expected_revision: raise HTTPException(409, '目录已被修改，请刷新后重新编辑')
    accounts = {row.id for row in await db.scalars(select(WebGenerationAccount).where(WebGenerationAccount.platform==platform))}
    if any(set(item.excluded_account_ids)-accounts for item in body.models):
        raise HTTPException(422, '排除账号不存在或不属于该平台')
    values = [item.model_dump() for item in body.models]
    names = {item['name'].casefold() for item in values}
    # Renaming is a new website identity; retain a disabled old identity to prevent history resurrection.
    for old in current.models:
        if old.name.casefold() not in names:
            values.append(dict(name=old.name, enabled=False, is_default=False, note=old.note, excluded_account_ids=old.excluded_account_ids))
    if len(values)>200: raise HTTPException(422, '目录最多保留200个型号（含停用记录）')
    if current.revision:
        changed = await db.execute(update(WebModelCatalog).where(WebModelCatalog.id==key,
            WebModelCatalog.revision==body.expected_revision).values(entries=values, revision=body.expected_revision+1))
        if changed.rowcount!=1: raise HTTPException(409, '目录已被修改，请刷新后重新编辑')
    else:
        try:
            async with db.begin_nested():
                db.add(WebModelCatalog(id=key, revision=1, entries=values)); await db.flush()
        except IntegrityError as exc:
            raise HTTPException(409, '目录已被其他页面建立，请刷新') from exc
    await db.flush()
    # Return through a fresh ORM read after bulk update, also valid with autoflush disabled.
    db.expire_all()
    return await catalog(db, platform, modality)


async def model_policy(db, platform, modality, model):
    """Unknown exact names remain manual-only; explicitly disabled names cannot bypass by typing."""
    directory = await catalog(db, platform, modality)
    entry = next((m for m in directory.models if m.name.casefold()==model.strip().casefold()), None)
    if entry and not entry.enabled: raise HTTPException(409, '该网页型号已停用，请重新选择')
    return directory, entry


async def execution_status(db, platform, modality, model='', account_id=None, batch=False, local_edit=False, reference_mode=None, duration_seconds=None, aspect_ratio=None, resolution=None, source_video=False):
    """Check adapter, scope, policy, live login, heartbeat and account occupancy without side effects."""
    scope_key(platform, modality)
    reasons = []
    if local_edit: reasons.append('局部选区修图暂需人工交接')
    if platform not in AUTO_PLATFORMS: reasons.append('该平台自动生成尚待适配；官网登录状态与自动执行能力分开核验')
    if modality=='video': reasons.extend(video_automation_issues(reference_mode,duration_seconds,aspect_ratio,resolution,source_video,platform=platform))
    if not model.strip(): reasons.append('请先选择网页模型')
    elif (platform, modality, model) not in AUTOMATIC_MODELS and platform in AUTO_PLATFORMS:
        reasons.append('此型号尚未适配自动执行；新增名称不会自动获得执行能力')
    directory = await catalog(db, platform, modality)
    entry = next((m for m in directory.models if m.name.casefold()==model.strip().casefold()), None)
    if entry and not entry.enabled: reasons.append('该型号已在网页模型目录停用')
    rows = list(await db.scalars(select(WebGenerationAccount).where(WebGenerationAccount.platform==platform)))
    if account_id: rows = [r for r in rows if r.id==account_id]
    candidates = [r for r in rows if r.enabled and (not entry or r.id not in entry.excluded_account_ids)]
    eligible = []
    notices = []
    unavailable = []
    wakeable = []
    if not candidates: reasons.append('没有允许使用该型号的启用账号，请到网页账号与模型管理检查')
    elif (platform, modality, model) in AUTOMATIC_MODELS:
        # Same readiness source as the accounts page, so both pages explain an account identically.
        from app.services.generation.web_accounts import readiness, READINESS_TEXT
        for row in candidates:
            state = readiness(row, model=model)
            if state['code']=='ready':
                eligible.append(row.id)
            elif not state['blocking']:
                wakeable.append(row)
                notices.append(row.display_name+'：'+state['reason'])
            else:
                unavailable.append(row.display_name+'：'+state['reason'])
            if not state['blocking'] and model not in (row.supported_models or []):
                notices.append(row.display_name+'：所选型号将在执行时核实，不影响提交任务')
        if not eligible and wakeable:
            # A live worker can wait for login or finish its current task; otherwise require the host.
            live = any(row.session_state!='offline' and row.heartbeat_at and row.heartbeat_at > now()-timedelta(seconds=90) for row in wakeable)
            from app.services.generation.web_desktop import host_online
            if not live and not await host_online(db):
                reasons.append('本机助手离线，无法自动启动执行器；请双击项目根目录的启动网页本机助手.cmd')
        elif not eligible:
            reasons.extend(unavailable[:8])
            if len(unavailable)>8: reasons.append('更多账号不可用原因请到账号页面查看')
    return WebExecutionRead(available=not reasons, reasons=reasons, eligible_account_ids=eligible, notices=notices)


def video_automation_issues(reference_mode=None,duration_seconds=None,aspect_ratio=None,resolution=None,source_video=False,*,platform='doubao'):
    """Reject unsupported reference semantics before queueing; the runner also verifies live controls.

    UI duration bounds are inspected at execution, rather than inferred from API model limits.
    A requested resolution cannot be silently discarded by a website without a resolution control.
    """
    if platform != 'doubao':
        return ['该平台的视频参数自动选择尚待核验']
    reasons=[]
    if source_video: reasons.append('原视频编辑的网页自动流程尚待适配')
    if reference_mode and reference_mode not in ('text','first_frame'): reasons.append('当前视频自动适配支持纯文本或单张首帧；其他参考语义不可自动改成首帧')
    if resolution: reasons.append('当前豆包视频网页未核验分辨率选择控件，请留空使用官网当前规格；指定分辨率需人工交接')
    return reasons
