"""Persist local desktop commands without exposing a host HTTP listener or shell execution."""
from datetime import datetime, timedelta
from uuid import uuid5,NAMESPACE_URL
from fastapi import HTTPException
from sqlalchemy import select
from app.models.task import GenerationTask
from app.models.web_generation import WebGenerationAccount
from app.core.contracts.web_generation import WebDesktopCommand,WebDesktopStatus
from app.services.generation.web_accounts import now

HOST='web-desktop-host'
KIND='web_desktop_command'


async def host_online(db):
    """Require a recent paired helper heartbeat before promising an automatic wakeup."""
    host = await db.get(GenerationTask, HOST)
    return bool(host and host.heartbeat_at and host.heartbeat_at > now()-timedelta(seconds=30))


def read_command(row):
    """Expose only account/action/state; host identity remains server-side."""
    p=row.payload
    return WebDesktopCommand(command_id=row.id,account_id=p['account_id'],platform=p['platform'],action=p['action'],state=p['state'],message=row.error or '')


async def status(db):
    """Polling is read-only and never launches or retries an operation."""
    host=await db.get(GenerationTask,HOST)
    online=bool(host and host.heartbeat_at and host.heartbeat_at>now()-timedelta(seconds=30))
    rows=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind==KIND).order_by(GenerationTask.created_at.desc()).limit(100))
    latest={}
    for row in rows:
        latest.setdefault(row.payload['account_id'],read_command(row))
    return WebDesktopStatus(online=online,commands=list(latest.values()))


async def launch(db,account_id,body):
    """Serialize each account's launch requests; request IDs make double-click/retry idempotent."""
    account=await db.scalar(select(WebGenerationAccount).where(WebGenerationAccount.id==account_id).with_for_update())
    if not account:raise HTTPException(404,'网页账号不存在')
    identity=uuid5(NAMESPACE_URL,'desktop:'+body.request_id).hex
    previous=await db.get(GenerationTask,identity)
    if previous:
        if previous.payload['account_id']!=account_id or previous.payload['action']!=body.action:raise HTTPException(409,'请求编号已用于其他账号操作')
        return read_command(previous)
    from app.services.generation.web_models import AUTO_PLATFORMS
    if body.action=='runner' and (account.platform not in AUTO_PLATFORMS or not account.enabled):raise HTTPException(409,'执行器仅支持已启用且已适配的平台账号')
    if body.action=='login' and account.active_task_id:raise HTTPException(409,'该账号有未结束任务，请从原任务恢复，不要另开登录窗口')
    host=await db.get(GenerationTask,HOST)
    if not host or not host.heartbeat_at or host.heartbeat_at<now()-timedelta(seconds=30):raise HTTPException(503,'本机助手离线；启动 Jellyfish 服务后自动连接，再重试即可，无需复制编号')
    rows=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind==KIND).order_by(GenerationTask.created_at.desc()))
    for row in rows:
        if row.payload['account_id']==account_id and row.payload['state'] in ['queued','starting','opened']:
            if row.payload['action']!=body.action:raise HTTPException(409,'该账号窗口已打开，请先关闭该窗口，再切换登录或执行器方式')
            return read_command(row)
    row=GenerationTask(id=identity,mode='async_polling',visibility='hidden',task_kind=KIND,status='pending',executor_type='web_desktop',payload={'account_id':account_id,'platform':account.platform,'action':body.action,'state':'queued','requested_at':now().isoformat()},error='')
    db.add(row);await db.flush();return read_command(row)


async def auto_launch(db):
    """Task-driven launches: pending work or a vanished mid-task executor starts its own runner.

    Only accounts whose worker heartbeat went stale are launched — a live worker claims or
    resumes by itself. Auto-capable platforms only (shared registry), enabled accounts, at
    most three new windows per poll. Persistent reservations prevent repeated polls opening all accounts.
    """
    from app.services.generation.web_generation import WEB_KINDS
    from app.services.generation.web_models import AUTO_PLATFORMS
    launched=0

    async def enqueue(account,task=None):
        """Deduplicate per account and back off repeated failures without cycling windows forever."""
        nonlocal launched
        recent=list(await db.scalars(select(GenerationTask).where(GenerationTask.task_kind==KIND,GenerationTask.payload['account_id'].as_string()==account.id).order_by(GenerationTask.created_at.desc()).limit(10)))
        # An explicit recovery starts a new bounded launch budget, without erasing prior diagnostics.
        after=datetime.fromisoformat(task.payload['recovery_requested_at']) if task and task.payload.get('recovery_requested_at') else None
        if any(row.payload.get('state') in ['queued','starting','opened'] for row in recent):return False
        if after:recent=[row for row in recent if row.created_at>=after]
        failures=0
        for previous in recent:
            if previous.payload.get('state')!='failed':break
            failures+=1
        if failures>=3:
            if task:
                task.payload={**task.payload,'runner_paused':True,'web_stage':'needs_user'}
                task.error='执行器连续启动失败，已暂停并保留原账号；处理本机问题后可恢复原任务，或取消释放'
            return False
        for row in recent:
            if row.payload.get('account_id')!=account.id:continue
            if row.payload.get('state') in ['queued','starting','opened']:return False
            if row.created_at>now()-timedelta(seconds=30*(1.5**failures)):return False
        recovery=f':{task.id}:{task.payload.get("recovery_epoch",0)}' if after else ''
        identity=uuid5(NAMESPACE_URL,'desktop:auto:'+account.id+recovery+':'+str(int(now().timestamp()//90))).hex
        if await db.get(GenerationTask,identity):return False
        db.add(GenerationTask(id=identity,mode='async_polling',visibility='hidden',task_kind=KIND,status='pending',executor_type='web_desktop',
            payload={'account_id':account.id,'platform':account.platform,'action':'runner','state':'queued','requested_at':now().isoformat(),'auto':True},error=''))
        launched+=1
        return True

    async def auto_launch_inner():
        """Reserve one account per pending task across polls; prefer already running workers."""
        nonlocal launched
        launched_account_ids=set()  # 同一轮 auto_launch 已启动的账号，跨 pending 任务去重
        pending=list(await db.scalars(select(GenerationTask).where(GenerationTask.task_kind.in_(WEB_KINDS),GenerationTask.executor_type=='windows_browser',GenerationTask.status=='pending',GenerationTask.cancel_requested==False).order_by(GenerationTask.created_at).with_for_update(skip_locked=True)))
        BATCH=3
        reserved={task.payload["dispatch_account_id"] for task in pending if task.payload.get("dispatch_account_id")}
        for task in pending:
            request=task.payload.get('web_request') or {}
            if request.get('platform') not in AUTO_PLATFORMS:continue
            from app.services.generation.web_models import model_policy, AUTOMATIC_MODELS
            from app.services.generation.web_accounts import readiness
            modality='video' if task.task_kind=='web_video_generation' else 'image'
            if (request.get('platform'),modality,request.get('requested_model')) not in AUTOMATIC_MODELS:continue
            try: _, policy=await model_policy(db,request['platform'],modality,request['requested_model'])
            except HTTPException:continue
            rows=list(await db.scalars(select(WebGenerationAccount).where(WebGenerationAccount.platform==request.get('platform','doubao'),WebGenerationAccount.enabled==True).order_by(WebGenerationAccount.last_assigned_at,WebGenerationAccount.id).with_for_update(skip_locked=True)))
            # Rank the whole pool; a blocked or login-waiting neighbour never outranks a ready account.
            ranks={'ready':0,'signed_in':1,'runner_offline':2,'needs_verification':3,'needs_login':4}
            rows.sort(key=lambda row: ranks.get(readiness(row,request.get('requested_model'))['code'],9))
            assigned=task.payload.get('dispatch_account_id')
            # Before any claim/submission, an automatic reservation may leave a now-unusable account.
            # Explicit account choices and all running-task identities remain immutable.
            if assigned and not request.get('account_id'):
                reserved_row=next((row for row in rows if row.id==assigned),None)
                if (not reserved_row or reserved_row.active_task_id or readiness(reserved_row)['blocking']
                    or (policy and assigned in policy.excluded_account_ids)):
                    reserved.discard(assigned)
                    task.payload={key:value for key,value in task.payload.items() if key!='dispatch_account_id'}
                    assigned=None
            for row in rows:
                if assigned and row.id!=assigned:continue
                if not assigned and row.id in reserved:continue
                if request.get('account_id') and row.id!=request['account_id']:continue
                if policy and row.id in policy.excluded_account_ids:continue
                state=readiness(row,request.get('requested_model'))
                if state['blocking'] or row.active_task_id:continue
                task.payload={**task.payload,'dispatch_account_id':row.id}
                reserved.add(row.id)
                if not fresh(row) and launched<BATCH and await enqueue(row,task):
                    launched_account_ids.add(row.id)
                break
        # A running task whose executor heartbeat went stale: relaunch to resume from its receipt.
        stuck=await db.scalars(select(WebGenerationAccount).where(WebGenerationAccount.platform.in_(AUTO_PLATFORMS),WebGenerationAccount.enabled==True,WebGenerationAccount.active_task_id.is_not(None)))
        for row in stuck:
            if launched>=BATCH:break
            if row.id in launched_account_ids:continue
            if fresh(row):continue
            task=await db.get(GenerationTask,row.active_task_id)
            if not task or task.executor_type!='windows_browser' or task.status!='running' or task.cancel_requested or task.payload.get('runner_paused'):continue
            if await enqueue(row,task):
                launched_account_ids.add(row.id)

    fresh=lambda row: row.session_state!='offline' and row.heartbeat_at and row.heartbeat_at>now()-timedelta(seconds=90)
    await auto_launch_inner()
    await db.flush()


async def poll(db,body):
    """Claim once for one local host; stale queued clicks expire rather than open unexpectedly."""
    host=await db.scalar(select(GenerationTask).where(GenerationTask.id==HOST).with_for_update())
    if not host:
        host=GenerationTask(id=HOST,mode='async_polling',visibility='hidden',task_kind='web_desktop_host',executor_type='web_desktop',status='succeeded',payload={'host_id':body.host_id},heartbeat_at=now())
        db.add(host);await db.flush()
    if host.payload.get('host_id')!=body.host_id:raise HTTPException(409,'本机助手已配对另一份本地身份，禁止抢占')
    host.heartbeat_at=now()
    for report in body.reports:
        row=await db.get(GenerationTask,report.command_id)
        if not row or row.task_kind!=KIND or row.payload.get('host_id')!=body.host_id:raise HTTPException(409,'不能回报其他助手或未领取的命令')
        if row.payload['state'] in ['closed','failed']:continue
        row.payload={**row.payload,'state':report.state};row.error=report.message
        row.status='failed' if report.state=='failed' else 'succeeded';row.finished_at=now()
    # Production sessions disable autoflush: persist acknowledgements before selecting claims.
    await db.flush()
    await auto_launch(db)
    rows=await db.scalars(select(GenerationTask).where(GenerationTask.task_kind==KIND,GenerationTask.status.in_(['pending','running'])).order_by(GenerationTask.created_at).with_for_update(skip_locked=True))
    commands=[]
    for row in rows:
        if row.status=='running':
            if row.payload.get('host_id')==body.host_id:commands.append(read_command(row))
            continue
        if row.created_at<now()-timedelta(seconds=60):
            row.payload={**row.payload,'state':'failed'};row.status='failed';row.error='打开请求已过期，请重新点击';row.finished_at=now();continue
        row.payload={**row.payload,'state':'starting','host_id':body.host_id};row.status='running';row.started_at=now();commands.append(read_command(row))
    await db.flush();return commands
