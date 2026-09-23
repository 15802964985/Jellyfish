"""Regression of account wakeups and persistent recovery using only an isolated database."""
import pytest
from fastapi import HTTPException
from app.models.task import GenerationTask
from app.models.web_generation import WebGenerationAccount
from app.services.generation import web_generation as web, web_desktop, web_accounts, web_models
from app.core.contracts.web_generation import WebRecoveryRequest, WebRunnerUpdate, WebDesktopPoll
from tests.test_project_video_export import _build_session
import hashlib


@pytest.mark.asyncio
async def test_pause_recovery_cas_and_late_cancel_report():
    """Recovery does not requeue; stale reports cannot re-pause a new recovery or revive cancellation."""
    db,engine=await _build_session()
    try:
        async with db:
            token='a'*40
            task=GenerationTask(id='original',mode='async_polling',visibility='task_center',task_kind=web.KIND,status='running',executor_type='windows_browser',payload={'runner_token_hash':hashlib.sha256(token.encode()).hexdigest(),'assigned_account_id':'a','web_request':{},'web_stage':'submitted','runner_paused':True},error='')
            account=WebGenerationAccount(id='a',platform='doubao',display_name='a',enabled=True,active_task_id=task.id)
            db.add_all([task,account]);await db.commit()
            await web.request_recovery(db,task.id,WebRecoveryRequest(expected_recovery_epoch=0))
            assert task.status=='running' and account.active_task_id=='original'
            assert (await web.resume(db,task.id,token))['recovery_epoch']==1
            with pytest.raises(HTTPException):await web.report(db,task.id,token,WebRunnerUpdate(stage='needs_user',paused=True))
            await web.report(db,task.id,token,WebRunnerUpdate(stage='needs_user',paused=True,recovery_epoch=1))
            assert task.payload['runner_paused']
            await web.cancel_browser_task(db,task.id)
            account.active_task_id='new-task';await db.flush()
            with pytest.raises(HTTPException):await web.report(db,task.id,token,WebRunnerUpdate(stage='needs_user',recovery_epoch=1))
            assert account.active_task_id=='new-task' and task.status=='cancelled'
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_wakeup_skips_live_login_blocker_and_paused_task():
    """A live login window cannot hide a later wakeable account; paused work never auto-restarts."""
    db,engine=await _build_session()
    try:
        async with db:
            db.autoflush=False
            db.add_all([
                WebGenerationAccount(id='a',platform='doubao',display_name='a',enabled=True,session_state='needs_login',supported_models=['Seedream 4.5'],heartbeat_at=web_accounts.now()),
                WebGenerationAccount(id='b',platform='doubao',display_name='b',enabled=True,session_state='offline',supported_models=['Seedream 4.5']),
                WebGenerationAccount(id='c',platform='doubao',display_name='c',enabled=True,session_state='offline',active_task_id='paused'),
                GenerationTask(id='pending',mode='async_polling',task_kind=web.KIND,status='pending',executor_type='windows_browser',payload={'web_request':{'platform':'doubao','requested_model':'Seedream 4.5'}},error=''),
                GenerationTask(id='paused',mode='async_polling',task_kind=web.KIND,status='running',executor_type='windows_browser',payload={'runner_paused':True},error='')])
            await db.commit()
            commands=await web_desktop.poll(db,WebDesktopPoll(host_id='a'*32))
            assert [item.account_id for item in commands]==['b']
    finally:await engine.dispose()


def test_short_video_mismatch_preserved_as_history():
    """Codec rounding is accepted; a missing second in a four-second shot is not."""
    from types import SimpleNamespace
    from app.services.generation.web_media import video_spec_issues
    request=SimpleNamespace(duration_seconds=4,aspect_ratio='1:1',resolution=None)
    assert not video_spec_issues(request,dict(duration_ms=4064,width=720,height=720))
    assert video_spec_issues(request,dict(duration_ms=3000,width=720,height=720))


@pytest.mark.asyncio
async def test_explicit_recovery_resets_launch_failure_budget():
    """Startup failures pause running work; explicit recovery can wake it despite old failures."""
    from datetime import timedelta
    db,engine=await _build_session()
    try:
        async with db:
            task=GenerationTask(id='stuck-budget',mode='async_polling',task_kind=web.KIND,status='running',executor_type='windows_browser',payload={'web_stage':'submitted','assigned_account_id':'a','web_request':{'platform':'doubao'}})
            db.add_all([task,WebGenerationAccount(id='a',platform='doubao',display_name='fixture',enabled=True,session_state='offline',active_task_id=task.id)])
            for index in range(3):
                db.add(GenerationTask(id=f'failure-{index}',mode='async_polling',task_kind=web_desktop.KIND,status='failed',payload={'account_id':'a','platform':'doubao','action':'runner','state':'failed'},created_at=web_accounts.now()-timedelta(minutes=index+5)))
            await db.commit()
            await web_desktop.auto_launch(db)
            assert task.payload['runner_paused']
            await web.request_recovery(db,task.id,WebRecoveryRequest(expected_recovery_epoch=0))
            commands=await web_desktop.poll(db,WebDesktopPoll(host_id='a'*32))
            assert len(commands)==1 and commands[0].account_id=='a'
            assert task.payload['recovery_epoch']==1 and not task.payload['runner_paused']
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_registered_platform_reaches_shared_lifecycle(monkeypatch):
    """An inert registered image capability uses shared readiness, dispatch and receipt validation."""
    monkeypatch.setattr(web_models,'AUTO_PLATFORMS',{'jimeng'})
    monkeypatch.setattr(web_models,'AUTOMATIC_MODELS',{('jimeng','image','Fixture model')})
    monkeypatch.setattr(web_models,'AUTOMATIC_RECEIPTS',{'jimeng':(r'https://jimeng\.jianying\.com/result/[0-9]+',r'[0-9]+')})
    db,engine=await _build_session()
    try:
        async with db:
            row=WebGenerationAccount(id='registered',platform='jimeng',display_name='fixture',enabled=True,session_state='ready',supported_models=['Fixture model'],heartbeat_at=web_accounts.now())
            db.add(row);await db.commit()
            assert web_accounts.readiness(row,'Fixture model')['code']=='ready'
            assert (await web_models.execution_status(db,'jimeng','image','Fixture model')).available
            token='r'*40
            task=GenerationTask(id='registered-task',mode='async_polling',task_kind=web.KIND,status='running',executor_type='windows_browser',payload={'runner_token_hash':hashlib.sha256(token.encode()).hexdigest(),'assigned_account_id':row.id,'web_request':{'platform':'jimeng'}})
            db.add(task);await db.flush()
            await web.report(db,task.id,token,WebRunnerUpdate(stage='submitted',conversation_url='https://jimeng.jianying.com/result/123',message_id='456'))
            assert task.payload['remote']['message_id']=='456'
            with pytest.raises(HTTPException):await web.report(db,task.id,token,WebRunnerUpdate(stage='submitted',conversation_url='https://www.doubao.com/chat/123',message_id='456'))
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_paused_browser_import_keeps_original_receipt_and_lease(monkeypatch):
    """Manual import cannot hijack an active browser, another result, or a newer account lease."""
    from io import BytesIO
    from fastapi import UploadFile
    from app.services.generation import web_handoff as handoff
    from app.core.contracts.web_generation import WebHandoffReceipt
    from tests.test_web_handoff import seed, request
    db,engine=await _build_session()
    try:
        async with db:
            await seed(db,'doubao')
            accepted=await web.submit(db,request('doubao'))
            task=await web.get_task(db,accepted.task_id)
            remote={'conversation_url':'https://www.doubao.com/chat/123','message_id':'456'}
            task.executor_type='windows_browser';task.payload={**task.payload,'remote':remote}
            receipt=WebHandoffReceipt(input_fingerprint=handoff.input_fingerprint(task),**remote,observed_model='actual webpage model',account_and_input_confirmed=True,original_download_confirmed=True)
            async def publish(db,task,file):
                """Observe successful guarded dispatch without writing object storage."""
                return 'published-original'
            monkeypatch.setattr(web,'publish_download',publish)
            with pytest.raises(HTTPException):await handoff.result(db,task.id,receipt,UploadFile(file=BytesIO()))
            task.payload={**task.payload,'runner_paused':True}
            with pytest.raises(HTTPException):await handoff.result(db,task.id,receipt.model_copy(update={'message_id':'789'}),UploadFile(file=BytesIO()))
            assert await handoff.result(db,task.id,receipt,UploadFile(file=BytesIO()))=='published-original'
            account=await db.get(WebGenerationAccount,'manual-account');account.active_task_id='new-task';await db.flush()
            with pytest.raises(HTTPException):await handoff.result(db,task.id,receipt,UploadFile(file=BytesIO()))
    finally:await engine.dispose()
