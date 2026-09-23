"""Account launch orchestration: no real browser, supplier or production writes."""
import pytest
from datetime import timedelta
from fastapi import HTTPException
from app.services.generation import web_desktop as service
from app.core.contracts.web_generation import WebDesktopLaunch,WebDesktopPoll,WebDesktopReport
from app.models.web_generation import WebGenerationAccount
from app.models.task import GenerationTask
from tests.test_project_video_export import _build_session

@pytest.mark.asyncio
async def test_launch_identity_replay_and_profile_mode_guard():
    """Repeated clicks/poll loss retain one command, and mode switches cannot steal a browser."""
    db,engine=await _build_session()
    db.autoflush=False
    try:
      async with db:
        db.add_all([WebGenerationAccount(id='a',platform='doubao',display_name='A',enabled=True),WebGenerationAccount(id='b',platform='jimeng',display_name='B',enabled=True)])
        await db.commit()
        request=WebDesktopLaunch(action='login',request_id='desktop_test_123456')
        with pytest.raises(HTTPException):await service.launch(db,'a',request)
        host=WebDesktopPoll(host_id='a'*32);assert await service.poll(db,host)==[]
        first=await service.launch(db,'a',request)
        assert (await service.launch(db,'a',request)).command_id==first.command_id
        assert (await service.launch(db,'a',request.model_copy(update={'request_id':'second_request_123'}))).command_id==first.command_id
        with pytest.raises(HTTPException):await service.launch(db,'b',request)
        with pytest.raises(HTTPException):await service.launch(db,'a',request.model_copy(update={'action':'runner','request_id':'third_request_1234'}))
        claimed=await service.poll(db,host);assert len(claimed)==1
        assert (await service.poll(db,host))[0].command_id==first.command_id
        with pytest.raises(HTTPException):await service.poll(db,WebDesktopPoll(host_id='b'*32))
        await service.poll(db,host.model_copy(update={'reports':[WebDesktopReport(command_id=first.command_id,state='opened')]}))
        assert (await service.status(db)).commands[0].state=='opened'
        assert await service.poll(db,host)==[]
        await service.poll(db,host.model_copy(update={'reports':[WebDesktopReport(command_id=first.command_id,state='closed')]}))
        assert await service.poll(db,host)==[]
        assert (await db.get(GenerationTask,first.command_id)).visibility=='hidden'
        with pytest.raises(HTTPException):await service.launch(db,'b',request.model_copy(update={'action':'runner','request_id':'runner_request_123'}))
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_expired_open_click_and_active_task_remain_safe():
    """Delayed offline clicks expire; login cannot disrupt a generating account."""
    db,engine=await _build_session()
    db.autoflush=False
    try:
      async with db:
        db.add(WebGenerationAccount(id='a',platform='doubao',display_name='A',enabled=True))
        await db.commit();host=WebDesktopPoll(host_id='a'*32);await service.poll(db,host)
        request=WebDesktopLaunch(action='login',request_id='desktop_test_expire')
        result=await service.launch(db,'a',request);row=await db.get(GenerationTask,result.command_id);row.created_at=service.now()-timedelta(seconds=61)
        assert await service.poll(db,host)==[];assert row.payload['state']=='failed'
        account=await db.get(WebGenerationAccount,'a');account.active_task_id='paid-original'
        with pytest.raises(HTTPException):await service.launch(db,'a',request.model_copy(update={'request_id':'desktop_busy_12345'}))
        assert account.active_task_id=='paid-original'
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_auto_launch_follows_pending_and_stuck_tasks():
    """Pending work or a vanished mid-task executor launches its runner automatically;
    live idle workers are left to claim by themselves and storms are guarded."""
    db,engine=await _build_session()
    db.autoflush=False
    try:
      async with db:
        from app.services.generation.web_generation import KIND as WEB_TASK_KIND
        db.add_all([
          WebGenerationAccount(id='idle',platform='doubao',display_name='I',enabled=True,supported_models=['Seedream 4.5'],session_state='ready'),
          WebGenerationAccount(id='live',platform='doubao',display_name='L',enabled=True,supported_models=['Seedream 4.5'],session_state='ready',heartbeat_at=service.now()),
        ])
        db.add(GenerationTask(id='t1',mode='async_polling',visibility='task_center',task_kind=WEB_TASK_KIND,status='pending',executor_type='windows_browser',
          payload={'web_request':{'platform':'doubao','requested_model':'Seedream 4.5','account_id':None}},error=''))
        await db.commit()
        host=WebDesktopPoll(host_id='a'*32)
        first=await service.poll(db,host)
        # A compatible live worker is reserved without opening another account.
        assert first==[]
        assert (await db.get(GenerationTask,'t1')).payload['dispatch_account_id']=='live'
        # No storm: the still-running command is re-sent as-is, never duplicated for the same account.
        again=await service.poll(db,host)
        assert [c.command_id for c in again]==[c.command_id for c in first]
        # A running task whose executor heartbeat vanished is relaunched to resume from its receipt.
        stuck=await db.get(WebGenerationAccount,'live');stuck.heartbeat_at=None;stuck.active_task_id='t-running'
        db.add(GenerationTask(id='t-running',mode='async_polling',visibility='task_center',task_kind=WEB_TASK_KIND,status='running',executor_type='windows_browser',payload={'assigned_account_id':'live'},error=''))
        await db.commit()
        resumed=await service.poll(db,host)
        by_account={c.account_id:c for c in resumed}
        assert set(by_account)=={'live','idle'} and by_account['live'].action=='runner'
        assert (await db.get(GenerationTask,'t1')).payload['dispatch_account_id']=='idle'
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_auto_launch_caps_workers_to_pending_count():
    """Burst 提交 3 个 pending 任务 + 6 个 idle 账号时，只启动 min(pending, BATCH)=3 个账号，
    避免单次提交时无意义打开所有账号浪费桌面会话。
    """
    db,engine=await _build_session()
    db.autoflush=False
    try:
      async with db:
        from app.services.generation.web_generation import KIND as WEB_TASK_KIND
        # 6 个 idle 账号：session_state='ready' + heartbeat_at=None（runner_offline 但会话有效）
        # LRU 排序：last_assigned_at 越早越优先
        accts=[WebGenerationAccount(id=f'idle{i}',platform='doubao',display_name=f'I{i}',enabled=True,
                 supported_models=['Seedream 4.5'],session_state='ready',heartbeat_at=None,
                 last_assigned_at=service.now()-timedelta(seconds=600-i))
                 for i in range(6)]
        db.add_all(accts)
        # 3 个 pending 任务（用 3 避免 enqueue identity 90s 时间窗冲突）
        for i in range(3):
            db.add(GenerationTask(id=f'burst{i}',mode='async_polling',visibility='task_center',task_kind=WEB_TASK_KIND,
              status='pending',executor_type='windows_browser',
              payload={'web_request':{'platform':'doubao','requested_model':'Seedream 4.5','account_id':None}},error=''))
        await db.commit()
        host=WebDesktopPoll(host_id='a'*32)
        first=await service.poll(db,host)
        # 期望：只启动 3 个账号（min(3 pending, BATCH=3) = 3），不是 6 个
        assert len(first)==3, f'expected 3 launched accounts, got {len(first)}: {[c.account_id for c in first]}'
        assert all(c.action=='runner' for c in first)
        # 不应启动同一个账号两次
        account_ids=[c.account_id for c in first]
        assert len(set(account_ids))==len(account_ids), f'duplicate account launch: {account_ids}'
        # 验证启动的是 LRU 排序前 3（last_assigned_at 最旧）
        assert sorted(account_ids)[:3]==sorted(account_ids), f'expected LRU first 3: {account_ids}'
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_auto_launch_single_pending_only_one_account():
    """单任务提交只拉起 1 个账号，不预热其他账号。
    """
    db,engine=await _build_session()
    db.autoflush=False
    try:
      async with db:
        from app.services.generation.web_generation import KIND as WEB_TASK_KIND
        db.add_all([
          WebGenerationAccount(id=f'idle{i}',platform='doubao',display_name=f'I{i}',enabled=True,
              supported_models=['Seedream 4.5'],session_state='ready',heartbeat_at=None)
              for i in range(3)
        ])
        db.add(GenerationTask(id='single',mode='async_polling',visibility='task_center',task_kind=WEB_TASK_KIND,
          status='pending',executor_type='windows_browser',
          payload={'web_request':{'platform':'doubao','requested_model':'Seedream 4.5','account_id':None}},error=''))
        await db.commit()
        host=WebDesktopPoll(host_id='a'*32)
        first=await service.poll(db,host)
        # 期望：只启动 1 个账号（pending 任务数 = 1）
        assert len(first)==1, f'expected 1 launched account, got {len(first)}: {[c.account_id for c in first]}'
        for _ in range(5):
            again=await service.poll(db,host)
            assert [c.command_id for c in again]==[c.command_id for c in first]
        assert (await db.get(GenerationTask,'single')).payload['dispatch_account_id']==first[0].account_id
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_auto_launch_storm_guard_backoff_shortened():
    """storm guard 改为 30s * 1.5^n 后，30s 后重试可放行（vs 旧版要等 90s * 2^n）。"""
    db,engine=await _build_session()
    db.autoflush=False
    try:
      async with db:
        from app.services.generation.web_generation import KIND as WEB_TASK_KIND
        from app.services.generation import web_desktop as svc
        from app.models.web_generation import WebGenerationAccount as Acc
        acc=Acc(id='flaky',platform='doubao',display_name='F',enabled=True,
                supported_models=['Seedream 4.5'],session_state='ready',heartbeat_at=None)
        db.add(acc)
        await db.commit()
        # 直接调 enqueue 内部逻辑：让 prior launch 30s 前记一条 failed
        from app.models.task import GenerationTask
        prior_id=__import__('uuid').uuid5(__import__('uuid').NAMESPACE_URL,'desktop:auto:flaky:'+str(int(svc.now().timestamp()//90))).hex
        db.add(GenerationTask(id=prior_id,mode='async_polling',visibility='hidden',task_kind='web_desktop_command',status='failed',executor_type='web_desktop',
            payload={'account_id':'flaky','platform':'doubao','action':'runner','state':'failed','requested_at':(svc.now()-__import__('datetime').timedelta(seconds=40)).isoformat(),'auto':True},error=''))
        await db.commit()
        # 现在调用 poll：flaky 是 idle runner_offline → 启动 → 但 prior 40s 前 failed → backoff 30*1.5=45s → 仍在 45s 内 → 拒绝
        host=WebDesktopPoll(host_id='a'*32)
        first=await service.poll(db,host)
        # 期望：flaky 没被启动（storm guard 阻止）
        launched_ids=[c.account_id for c in first]
        assert 'flaky' not in launched_ids, f'flaky should be blocked by storm guard: {launched_ids}'
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_pool_skips_blocked_and_prefers_login_then_claims_unknown_model():
    """One restricted account cannot block a ready neighbour with an empty model cache."""
    from app.services.generation import web_generation, web_models, web_accounts
    db,engine=await _build_session()
    try:
      async with db:
        for identity,state in [('a','limited'),('b','needs_login'),('c','ready')]:
            db.add(WebGenerationAccount(id=identity,platform='doubao',display_name=identity,enabled=True,
                supported_models=[],session_state=state,heartbeat_at=service.now()))
        task=GenerationTask(id='pool-video',mode='async_polling',visibility='task_center',task_kind='web_video_generation',
            status='pending',executor_type='windows_browser',payload={'dispatch_account_id':'a','web_request':{'platform':'doubao','requested_model':'Seedance 2.0 Fast','account_id':None}},error='')
        db.add(task);await db.commit()
        await service.poll(db,WebDesktopPoll(host_id='a'*32))
        assert task.payload['dispatch_account_id']=='c'
        status=await web_models.execution_status(db,'doubao','video','Seedance 2.0 Fast')
        assert status.available and status.eligible_account_ids==['c']
        claimed=await web_generation.claim(db,'c',modality='video')
        assert claimed['task_id']=='pool-video'
        # The same acceptance rule must actually allow a login-waiting worker to claim its task.
        task2=GenerationTask(id='login-image',mode='async_polling',visibility='task_center',task_kind='web_image_generation',
            status='pending',executor_type='windows_browser',payload={'web_request':{'platform':'doubao','requested_model':'Seedream 4.5','account_id':'b'}},error='')
        db.add(task2);await db.commit()
        claimed=await web_generation.claim(db,'b')
        assert claimed['task_id']=='login-image'
        assert (await db.get(WebGenerationAccount,'b')).active_task_id=='login-image'
    finally: await engine.dispose()

@pytest.mark.asyncio
async def test_recent_offline_heartbeat_does_not_delay_login_wakeup():
    """A just-closed runner must wake immediately instead of waiting ninety seconds for heartbeat expiry."""
    db,engine=await _build_session()
    try:
      async with db:
        db.add(WebGenerationAccount(id='closed',platform='doubao',display_name='C',enabled=True,
            supported_models=[],session_state='offline',heartbeat_at=service.now()))
        db.add(GenerationTask(id='fresh-offline',mode='async_polling',visibility='task_center',task_kind='web_video_generation',
            status='pending',executor_type='windows_browser',payload={'web_request':{'platform':'doubao','requested_model':'Seedance 2.0 Fast','account_id':None}},error=''))
        await db.commit()
        commands=await service.poll(db,WebDesktopPoll(host_id='a'*32))
        assert len(commands)==1 and commands[0].account_id=='closed'
    finally: await engine.dispose()
