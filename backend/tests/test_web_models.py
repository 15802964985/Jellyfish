"""Website policy persistence and runtime eligibility without any external generation."""
import pytest
from datetime import timedelta
from fastapi import HTTPException
from app.models.web_generation import WebGenerationAccount
from app.core.contracts.web_models import WebCatalogWrite, WebModelPolicy
from app.services.generation import web_models as service, web_accounts
from app.services.generation.web_handoff import reserve_account
from tests.test_project_video_export import _build_session


@pytest.mark.asyncio
async def test_catalog_revision_disable_rename_and_scope():
    """Operator intent persists across history merge; rename and media scopes cannot reactivate old names."""
    db, engine = await _build_session()
    try:
        async with db:
            db.autoflush=False
            db.add(WebGenerationAccount(id='a',platform='doubao',display_name='A',enabled=True,supported_models=['Seedream 4.5']))
            await db.commit()
            initial = await service.catalog(db,'doubao','image')
            assert initial.revision==0
            saved = await service.save_catalog(db,'doubao','image',WebCatalogWrite(expected_revision=0,models=[WebModelPolicy(name='新官网型号',is_default=True)]))
            assert saved.revision==1
            assert not next(m for m in saved.models if m.name=='Seedream 4.5').enabled
            assert not next(m for m in saved.models if m.name=='新官网型号').automatic_supported
            await db.commit()
            with pytest.raises(HTTPException): await service.save_catalog(db,'doubao','image',WebCatalogWrite(expected_revision=0,models=[]))
            assert (await service.catalog(db,'doubao','video')).revision==0
            with pytest.raises(HTTPException): await service.model_policy(db,'doubao','image',' seedream 4.5 ')
            with pytest.raises(HTTPException): await service.save_catalog(db,'doubao','image',WebCatalogWrite(expected_revision=1,models=[WebModelPolicy(name='x',excluded_account_ids=['foreign'])]))
    finally: await engine.dispose()


@pytest.mark.asyncio
async def test_execution_reasons_refresh_and_account_exclusion():
    """Offline/login/model/busy state changes affect eligibility, and manual policy cannot grant automation."""
    db, engine=await _build_session()
    try:
        async with db:
            row=WebGenerationAccount(id='a',platform='doubao',display_name='A',enabled=True,session_state='offline',supported_models=['Seedream 4.5'])
            db.add(row);await db.commit()
            from app.services.generation.web_desktop import poll
            from app.core.contracts.web_generation import WebDesktopPoll
            await poll(db, WebDesktopPoll(host_id='a'*32))
            # Executor stopped while the last login state was healthy: submission queues and
            # task-driven auto-launch starts the runner — offline is a notice, not a blocker.
            status=await service.execution_status(db,'doubao','image','Seedream 4.5')
            assert status.available and any('自动启动' in n for n in status.notices)
            # Login waits are accepted and resumed in the same task, not rejected at submission.
            row.session_state='needs_login';row.heartbeat_at=None;await db.commit()
            blocked=await service.execution_status(db,'doubao','image','Seedream 4.5')
            assert blocked.available and any('登录' in r for r in blocked.notices)
            row.session_state='ready';row.heartbeat_at=web_accounts.now();await db.commit()
            assert (await service.execution_status(db,'doubao','image','Seedream 4.5')).available
            assert (await service.execution_status(db,'doubao','image','Seedream 4.5',batch=True)).available
            assert not (await service.execution_status(db,'doubao','image','Seedream 4.5',local_edit=True)).available
            assert (await service.execution_status(db,'doubao','video','Seedance 2.0 Mini')).available
            row.active_task_id='original';await db.commit()
            assert (await service.execution_status(db,'doubao','image','Seedream 4.5')).available
            row.active_task_id=None;await db.commit()
            await service.save_catalog(db,'doubao','image',WebCatalogWrite(expected_revision=0,models=[WebModelPolicy(name='Seedream 4.5',excluded_account_ids=['a'])]));await db.commit()
            assert not (await service.execution_status(db,'doubao','image','Seedream 4.5')).available
            assert await web_accounts.eligible_accounts(db,'doubao','Seedream 4.5')==[]
            with pytest.raises(HTTPException):await reserve_account(db,'doubao','a','Seedream 4.5')
    finally:await engine.dispose()


@pytest.mark.asyncio
async def test_existing_request_survives_catalog_and_account_changes():
    """An uncertain original request returns its original task, while new disabled-model submits are rejected."""
    from app.services.generation import web_generation as generation
    from app.core.contracts.web_generation import WebImageRequest
    from app.models.studio_shots import ShotFrameImage
    from tests.test_project_video_export import _seed_project
    db, engine=await _build_session()
    try:
        async with db:
            await _seed_project(db)
            account=WebGenerationAccount(id='a',platform='doubao',display_name='A',enabled=True)
            db.add(account);db.add(ShotFrameImage(id=990,shot_detail_id='shot-1',frame_type='first',version_id=1));await db.commit()
            body=WebImageRequest(account_id='a',request_id='catalog_idem_123456',target_type='frame',entity_id='shot-1',slot_id=990,expected_version=1,prompt='building',external_transfer_confirmed=True)
            first=await generation.submit(db,body);await db.commit()
            task=await generation.get_task(db,first.task_id)
            snapshot=task.payload['web_catalog_snapshot']
            await service.save_catalog(db,'doubao','image',WebCatalogWrite(expected_revision=0,models=[]));await db.commit()
            account=await db.get(WebGenerationAccount,'a');account.enabled=False;await db.commit()
            assert (await generation.submit(db,body)).task_id==first.task_id
            assert (await generation.get_task(db,first.task_id)).payload['web_catalog_snapshot']==snapshot
            with pytest.raises(HTTPException):await generation.submit(db,body.model_copy(update={'request_id':'catalog_new_123456','account_id':None}))
    finally:await engine.dispose()

@pytest.mark.asyncio
async def test_video_capability_and_login_are_separate():
    """Adapted video models accept logged-in accounts; unadapted platforms remain separate."""
    db,engine=await _build_session()
    try:
        async with db:
            row=WebGenerationAccount(id='video-ready',platform='doubao',display_name='A',enabled=True,session_state='ready',supported_models=['Seedream 4.5','Seedance 2.0 Mini'],heartbeat_at=web_accounts.now())
            db.add(row);await db.commit()
            read=web_accounts.account_read(row)
            assert read.supported_models==['Seedream 4.5']
            assert read.supported_video_models==['Seedance 2.0 Mini']
            assert (await service.execution_status(db,'doubao','video','Seedance 2.0 Mini',reference_mode='first_frame',duration_seconds=4,aspect_ratio='1:1')).available
            for kwargs in ({'resolution':'1080p'},{'reference_mode':'first_last_frames'},{'source_video':True}):
                assert not (await service.execution_status(db,'doubao','video','Seedance 2.0 Mini',**kwargs)).available
            assert not (await service.execution_status(db,'doubao','video','Seedream 4.5')).available
            row.session_state='signed_in';await db.commit()
            assert (await service.execution_status(db,'doubao','video','Seedance 2.0 Mini')).available
            assert not (await service.execution_status(db,'jimeng','video','Seedance 2.0 Mini')).available
    finally: await engine.dispose()


@pytest.mark.asyncio
async def test_automatic_pool_uses_any_eligible_account_and_checks_all_candidates():
    """A blocked neighbour or display truncation must not disable an otherwise usable pool."""
    db, engine = await _build_session()
    try:
        async with db:
            rows = [WebGenerationAccount(id=str(i),platform='doubao',display_name=str(i),enabled=True,
                session_state='ready',supported_models=['Seedream 4.5'],heartbeat_at=web_accounts.now()) for i in range(10)]
            db.add_all(rows);await db.commit()
            result = await service.execution_status(db,'doubao','image','Seedream 4.5')
            assert result.available and len(result.eligible_account_ids)==10
            for row in rows[:-1]: row.session_state='needs_login'
            await db.commit()
            result = await service.execution_status(db,'doubao','image','Seedream 4.5')
            assert result.available and result.eligible_account_ids==['9']
            assert (await service.execution_status(db,'doubao','image','Seedream 4.5',account_id='0')).available
            rows[-1].heartbeat_at=None;await db.commit()
            assert (await service.execution_status(db,'doubao','image','Seedream 4.5')).available
            for row in rows: row.session_state='limited'
            await db.commit()
            assert not (await service.execution_status(db,'doubao','image','Seedream 4.5')).available
    finally: await engine.dispose()
